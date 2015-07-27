/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * hprose/client/Client.js                                *
 *                                                        *
 * HproseClient for Node.js.                              *
 *                                                        *
 * LastModified: Jul 27, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*global Proxy */
'use strict';

var util = require('util');
var parse = require('url').parse;
var EventEmitter = require('events').EventEmitter;

var setImmediate = global.setImmediate;
var Tags = global.hprose.Tags;
var ResultMode = global.hprose.ResultMode;
var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;
var Future = global.hprose.Future;
var slice = Function.prototype.call.bind(Array.prototype.slice);

var GETFUNCTIONS = new Uint8Array(1);
GETFUNCTIONS[0] = Tags.TagEnd;

function noop(){}

var s_boolean = 'boolean';
var s_string = 'string';
var s_number = 'number';
var s_function = 'function';
var s_object = 'object';
var s_undefined = 'undefined';

function HproseProxy(setFunction, ns) {
    this.get = function(proxy, name) {
        if (ns) name = ns + '_' + name;
        return Proxy.createFunction(
            new HproseProxy(setFunction, name),
            setFunction(this, name)
        );
    };
}

function Client(uri, functions) {
    EventEmitter.call(this);

    // private members
    var _uri;
    var _uris               = [];
    var _index              = -1;
    var _byref              = false;
    var _simple             = false;
    var _timeout            = 30000;
    var _retry              = 10;
    var _idempotent         = false;
    var _failswitch         = false;
    var _lock               = false;
    var _tasks              = [];
    var _useHarmonyMap      = false;
    var _onerror            = noop;
    var _filters            = [];
    var _batch              = false;
    var _batches            = [];
    var _ready              = new Future();
    var _topics             = Object.create(null);
    var _id                 = null;
    var _options            = Object.create(null);
    var _keepAlive          = true;

    var self = this;

    function outputFilter(request, context) {
        for (var i = 0, n = _filters.length; i < n; i++) {
            request = _filters[i].outputFilter(request, context);
        }
        return request;
    }

    function inputFilter(response, context) {
        for (var i = _filters.length - 1; i >= 0; i--) {
            response = _filters[i].inputFilter(response, context);
        }
        return response;
    }

    var beforeFilterHandler = function(request, context) {
        request = outputFilter(request, context);
        return afterFilterHandler(request, context)
        .then(function(response) {
            if (context.oneway) return;
            return inputFilter(response, context);
        });
    };

    var afterFilterHandler = function(request, context) {
         return self.sendAndReceive(request, context);
    };

    function sendAndReceive(request, context, onsuccess, onerror) {
        beforeFilterHandler(request, context)
        .then(onsuccess, function(e) {
            if (retry(request, context, onsuccess, onerror)) return;
            onerror(e);
        });
    }

    function retry(data, context, onsuccess, onerror) {
        if (context.failswitch) {
            if (++_index >= _uris.length) {
                _index = 0;
                _uri = _uris[_index];
            }
        }
        if (context.idempotent) {
            if (--context.retry >= 0) {
                var interval = (10 - context.retry) * 500;
                if (context.retry > 10) interval = 500;
                global.setTimeout(function() {
                    sendAndReceive(data, context, onsuccess, onerror);
                }, interval);
                return true;
            }
        }
        return false;
    }

    function initService(stub) {
        var context = {
            retry: _retry,
            idempotent: true,
            failswitch: true,
            timeout: _timeout,
            client: self,
            userdata: {}
        };
        var onsuccess = function(data) {
            var error = null;
            try {
                var stream = new BytesIO(data);
                var reader = new Reader(stream, true);
                var tag = stream.readByte();
                switch (tag) {
                    case Tags.TagError:
                        error = new Error(reader.readString());
                        break;
                    case Tags.TagFunctions:
                        var functions = reader.readList();
                        reader.checkTag(Tags.TagEnd);
                        setFunctions(stub, functions);
                        break;
                    default:
                        error = new Error('Wrong Response:\r\n' + BytesIO.toString(data));
                        break;
                }
            }
            catch (e) {
                error = e;
            }
            if (error !== null) {
                _ready.reject(error);
            }
            else {
                _ready.resolve(stub);
            }
        };
        sendAndReceive(GETFUNCTIONS, context, onsuccess, _ready.reject);
    }

    function setFunction(stub, name) {
        return function() {
            if (_batch) {
                return _invoke(stub, name, slice(arguments), true);
            }
            else {
                return Future.all(arguments).then(function(args) {
                    return _invoke(stub, name, args, false);
                });
            }
        };
    }

    function setMethods(stub, obj, namespace, name, methods) {
        if (obj[name] !== undefined) return;
        obj[name] = {};
        if (typeof(methods) === s_string || methods.constructor === Object) {
            methods = [methods];
        }
        if (Array.isArray(methods)) {
            for (var i = 0; i < methods.length; i++) {
                var m = methods[i];
                if (typeof(m) === s_string) {
                    obj[name][m] = setFunction(stub, namespace + name + '_' + m);
                }
                else {
                    for (var n in m) {
                        setMethods(stub, obj[name], name + '_', n, m[n]);
                    }
                }
            }
        }
    }

    function setFunctions(stub, functions) {
        for (var i = 0; i < functions.length; i++) {
            var f = functions[i];
            if (typeof(f) === s_string) {
                if (stub[f] === undefined) {
                    stub[f] = setFunction(stub, f);
                }
            }
            else {
                for (var name in f) {
                    setMethods(stub, stub, '', name, f[name]);
                }
            }
        }
    }

    function copyargs(src, dest) {
        var n = Math.min(src.length, dest.length);
        for (var i = 0; i < n; ++i) dest[i] = src[i];
    }

    function initContext() {
        return {
            mode: ResultMode.Normal,
            byref: _byref,
            simple: _simple,
            timeout: _timeout,
            retry: _retry,
            idempotent: _idempotent,
            failswitch: _failswitch,
            oneway: false,
            sync: false,
            onsuccess: undefined,
            onerror: undefined,
            useHarmonyMap: _useHarmonyMap,
            client: self,
            userdata: {}
        };
    }

    function getContext(stub, name, args) {
        var context = initContext();
        if (name in stub) {
            var method = stub[name];
            for (var key in method) {
                if (key in context) {
                    context[key] = method[key];
                }
            }
        }
        var i = 0, n = args.length;
        for (; i < n; ++i) {
            if (typeof args[i] === s_function) break;
        }
        if (i === n) return context;
        var extra = args.splice(i, n - i);
        context.onsuccess = extra[0];
        n = extra.length;
        for (i = 1; i < n; ++i) {
            var arg = extra[i];
            switch (typeof arg) {
            case s_function:
                context.onerror = arg; break;
            case s_boolean:
                context.byref = arg; break;
            case s_number:
                context.mode = arg; break;
            case s_object:
                for (var k in arg) {
                    if (k in context) {
                        context[k] = arg[k];
                    }
                }
                break;
            }
        }
        return context;
    }

    function encode(name, args, context) {
        var stream = new BytesIO();
        stream.writeByte(Tags.TagCall);
        var writer = new Writer(stream, context.simple);
        writer.writeString(name);
        if (args.length > 0 || context.byref) {
            writer.reset();
            writer.writeList(args);
            if (context.byref) {
                writer.writeBoolean(true);
            }
        }
        return stream;
    }

    function __invoke(name, args, context, batch) {
        if (_lock) {
            return Future.promise(function(resolve, reject) {
                _tasks.push({
                    batch: batch,
                    name: name,
                    args: args,
                    context: context,
                    resolve: resolve,
                    reject: reject
                });
            });
        }
        if (batch) {
            return multicall(name, args, context);
        }
        return call(name, args, context);
    }

    function _invoke(stub, name, args, batch) {
        return __invoke(name, args, getContext(stub, name, args), batch);
    }

    function errorHandling(name, error, context, reject) {
        try {
            if (context.onerror) {
                context.onerror(name, error);
            }
            else {
                _onerror(name, error);
                self.emit('error', name, error);
            }
            reject(error);
        }
        catch (e) {
            reject(e);
        }
    }

    var invokeHandler = function(name, args, context) {
        var request = encode(name, args, context);
        request.writeByte(Tags.TagEnd);
        return Future.promise(function(resolve, reject) {
            sendAndReceive(request.bytes, context, function(response) {
                if (context.oneway) {
                    resolve();
                    return;
                }
                var result = null;
                var error = null;
                try {
                    if (context.mode === ResultMode.RawWithEndTag) {
                        result = response;
                    }
                    else if (context.mode === ResultMode.Raw) {
                        result = response.subarray(0, response.byteLength - 1);
                    }
                    else {
                        var stream = new BytesIO(response);
                        var reader = new Reader(stream, false, context.useHarmonyMap);
                        var tag = stream.readByte();
                        if (tag === Tags.TagResult) {
                            if (context.mode === ResultMode.Serialized) {
                                result = reader.readRaw();
                            }
                            else {
                                result = reader.unserialize();
                            }
                            tag = stream.readByte();
                            if (tag === Tags.TagArgument) {
                                reader.reset();
                                var _args = reader.readList();
                                copyargs(_args, args);
                                tag = stream.readByte();
                            }
                        }
                        else if (tag === Tags.TagError) {
                            error = new Error(reader.readString());
                            tag = stream.readByte();
                        }
                        if (tag !== Tags.TagEnd) {
                            error = new Error('Wrong Response:\r\n' + BytesIO.toString(response));
                        }
                    }
                }
                catch (e) {
                    error = e;
                }
                if (error) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            }, reject);
        });
    };

    function unlock(sync) {
        return function() {
            if (sync) {
                _lock = false;
                setImmediate(function(tasks) {
                    tasks.forEach(function(task) {
                        if ('settings' in task) {
                            endBatch(task.settings)
                            .then(task.resolve, task.reject);
                        }
                        else {
                            __invoke(task.name, task.args, task.context, task.batch).then(task.resolve, task.reject);
                        }
                    });
                }, _tasks);
                _tasks = [];
            }
        };
    }

    function call(name, args, context) {
        if (context.sync) _lock = true;
        var promise = Future.promise(function(resolve, reject) {
            invokeHandler(name, args, context).then(function(result) {
                try {
                    if (context.onsuccess) {
                        try {
                            context.onsuccess(result, args);
                        }
                        catch (e) {
                            if (context.onerror) {
                                context.onerror(name, e);
                            }
                            reject(e);
                        }
                    }
                    resolve(result);
                }
                catch (e) {
                    reject(e);
                }
            }, function(error) {
                errorHandling(name, error, context, reject);
            });
        });
        promise.whenComplete(unlock(context.sync));
        return promise;
    }

    function multicall(name, args, context) {
        if (context.mode === ResultMode.RawWithEndTag) {
            throw new Error("ResultMode.RawWithEndTag doesn't support in batch mode.");
        }
        else if (context.mode === ResultMode.Raw) {
            throw new Error("ResultMode.Raw doesn't support in batch mode.");
        }
        return Future.promise(function(resolve, reject) {
            _batches.push({
                args: args,
                name: name,
                context: context,
                resolve: resolve,
                reject: reject
            });
        });
    }

    function getBatchContext(settings) {
        var context = {
            timeout: _timeout,
            retry: _retry,
            idempotent: _idempotent,
            failswitch: _failswitch,
            oneway: false,
            sync: false,
            useHarmonyMap: _useHarmonyMap,
            client: self,
            userdata: {}
        };
        for (var k in settings) {
            if (k in context) {
                context[k] = settings[k];
            }
        }
        return context;
    }

    var batchInvokeHandler = function(batches, context) {
        var request = batches.reduce(function(stream, item) {
            stream.write(encode(item.name, item.args, item.context));
            return stream;
        }, new BytesIO());
        request.writeByte(Tags.TagEnd);
        return Future.promise(function(resolve, reject) {
            sendAndReceive(request.bytes, context, function(response) {
                if (context.oneway) {
                    resolve(batches);
                    return;
                }
                var result = null;
                var error = null;
                var i = -1;
                var stream = new BytesIO(response);
                var reader = new Reader(stream, false, context.useHarmonyMap);
                var tag;
                try {
                    while ((tag = stream.readByte()) !== Tags.TagEnd) {
                        switch (tag) {
                        case Tags.TagResult:
                            var mode = batches[i + 1].context.mode;
                            if (mode === ResultMode.Serialized) {
                                result = reader.readRaw();
                            }
                            else {
                                reader.reset();
                                result = reader.unserialize();
                            }
                            batches[++i].result = result;
                            batches[i].error = null;
                            break;
                        case Tags.TagArgument:
                            reader.reset();
                            var _args = reader.readList();
                            copyargs(_args, batches[i].args);
                            break;
                        case Tags.TagError:
                            reader.reset();
                            error = new Error(reader.readString());
                            batches[++i].error = error;
                            break;
                        default:
                            error = new Error('Wrong Response:\r\n' + BytesIO.toString(response));
                            batches[++i].error = error;
                            break;
                        }
                    }
                }
                catch (e) {
                    var n = batches.length;
                    batches[i < 0 ? 0 : i >= n ? n - 1 : i].error = e;
                }
                resolve(batches);
            }, reject);
        });
    };

    function beginBatch() {
        _batch = true;
    }

    function endBatch(settings) {
        settings = settings || {};
        _batch = false;
        if (_lock) {
            return Future.promise(function(resolve, reject) {
                _tasks.push({
                    batch: true,
                    settings: settings,
                    resolve: resolve,
                    reject: reject
                });
            });
        }
        var batchSize = _batches.length;
        if (batchSize === 0) return;
        var context = getBatchContext(settings);
        if (context.sync) _lock = true;
        var batches = _batches;
        _batches = [];
        var promise = Future.promise(function(resolve, reject) {
            batchInvokeHandler(batches, context).then(function(batches) {
                batches.forEach(function(i) {
                    if (i.error) {
                        errorHandling(i.name, i.error, i.context, i.reject);
                    }
                    else {
                        try {
                            if (i.context.onsuccess) {
                                try {
                                    i.context.onsuccess(i.result, i.args);
                                }
                                catch (e) {
                                    if (i.context.onerror) {
                                        i.context.onerror(i.name, e);
                                    }
                                    i.reject(e);
                                }
                            }
                            i.resolve(i.result);
                        }
                        catch (e) {
                            i.reject(e);
                        }
                    }
                    delete i.context;
                    delete i.resolve;
                    delete i.reject;
                });
                resolve(batches);
            }, function(error) {
                batches.forEach(function(i) {
                    if ('reject' in i) {
                        errorHandling(i.name, error, i.context, i.reject);
                    }
                });
                reject(error);
            });
        });
        promise.whenComplete(unlock(context.sync));
        return promise;
    }

    // public methods
    function getOnError() {
        return _onerror;
    }
    function setOnError(value) {
        if (typeof(value) === s_function) {
            _onerror = value;
        }
    }
    function getUri() {
        return _uri;
    }
    function getFailswitch() {
        return _failswitch;
    }
    function setFailswitch(value) {
        _failswitch = !!value;
    }
    function getTimeout() {
        return _timeout;
    }
    function setTimeout(value) {
        if (typeof(value) === 'number') {
            _timeout = value | 0;
        }
        else {
            _timeout = 0;
        }
    }
    function getRetry() {
        return _retry;
    }
    function setRetry(value) {
        if (typeof(value) === 'number') {
            _retry = value | 0;
        }
        else {
            _retry = 0;
        }
    }
    function getIdempotent() {
        return _idempotent;
    }
    function setIdempotent(value) {
        _idempotent = !!value;
    }
    function setKeepAlive(value) {
        _keepAlive = !!value;
    }
    function getKeepAlive() {
        return _keepAlive;
    }
    function getByRef() {
        return _byref;
    }
    function setByRef(value) {
        _byref = !!value;
    }
    function getSimpleMode() {
        return _simple;
    }
    function setSimpleMode(value) {
        _simple = !!value;
    }
    function getUseHarmonyMap() {
        return _useHarmonyMap;
    }
    function setUseHarmonyMap(value) {
        _useHarmonyMap = !!value;
    }
    function setOption(option, value) {
        _options[option] = value;
    }
    function getOptions() {
        return _options;
    }
    function getFilter() {
        if (_filters.length === 0) {
            return null;
        }
        return _filters[0];
    }
    function setFilter(filter) {
        _filters.length = 0;
        if (filter &&
            typeof filter.inputFilter === 'function' &&
            typeof filter.outputFilter === 'function') {
            _filters.push(filter);
        }
    }
    function addFilter(filter) {
        if (filter &&
            typeof filter.inputFilter === 'function' &&
            typeof filter.outputFilter === 'function') {
            _filters.push(filter);
        }
    }
    function removeFilter(filter) {
        var i = _filters.indexOf(filter);
        if (i === -1) {
            return false;
        }
        _filters.splice(i, 1);
        return true;
    }
    function useService(uri, functions, create) {
        if (create === undefined) {
            if (typeof(functions) === s_boolean) {
                create = functions;
                functions = false;
            }
            if (!functions) {
                if (typeof(uri) === s_boolean) {
                    create = uri;
                    uri = false;
                }
                else if (uri && uri.constructor === Object ||
                         Array.isArray(uri)) {
                    functions = uri;
                    uri = false;
                }
            }
        }
        var stub = self;
        if (create) {
            stub = {};
        }
        if (!uri && !_uri) {
            return new Error('You should set server uri first!');
        }
        if (uri) {
            _uri = uri;
        }
        if (typeof(functions) === s_string ||
            (functions && functions.constructor === Object)) {
            functions = [functions];
        }
        if (Array.isArray(functions)) {
            setFunctions(stub, functions);
        }
        else {
            if (typeof(Proxy) === 'undefined') {
                setImmediate(initService, stub);
                return _ready;
            }
            stub = Proxy.create(new HproseProxy(setFunction));
        }
        _ready.resolve(stub);
        return stub;
    }
    function invoke() {
        var args = slice(arguments);
        var name = args.shift();
        return _invoke(self, name, args, _batch);
    }
    function ready(onComplete, onError) {
        return _ready.then(onComplete, onError);
    }
    function getTopic(name, id, create) {
        if (_topics[name]) {
            var topics = _topics[name];
            if (topics[id]) {
                return topics[id];
            }
            return null;
        }
        if (create) {
            _topics[name] = Object.create(null);
        }
        return null;
    }
    // subscribe(name, callback, timeout)
    // subscribe(name, id, callback, timeout)
    function subscribe(name, id, callback, timeout) {
        if (typeof name !== s_string) {
            throw new TypeError('topic name must be a string.');
        }
        if (id === undefined || id === null) {
            if (typeof callback === s_function) {
                id = callback;
            }
            else {
                throw new TypeError('callback must be a function.');
            }
        }
        if (typeof id === s_function) {
            timeout = callback;
            callback = id;
            if (_id === null) {
                _id = autoId();
            }
            _id.then(function(id) {
                subscribe(name, id, callback, timeout);
            });
            return;
        }
        if (typeof callback !== s_function) {
            throw new TypeError('callback must be a function.');
        }
        if (Future.isPromise(id)) {
            id.then(function(id) {
                subscribe(name, id, callback, timeout);
            });
            return;
        }
        if (timeout === undefined) timeout = _timeout;
        var topic = getTopic(name, id, true);
        if (topic === null) {
            var cb = function() {
                _invoke(self, name, [id, topic.handler, cb, {
                    idempotent: true,
                    failswitch: false,
                    timeout: timeout
                }], false);
            };
            topic = {
                handler: function(result) {
                    var topic = getTopic(name, id, false);
                    if (topic) {
                        if (result !== null) {
                            var callbacks = topic.callbacks;
                            for (var i = 0, n = callbacks.length; i < n; ++i) {
                                callbacks[i](result);
                            }
                        }
                        if (getTopic(name, id, false) !== null) cb();
                    }
                },
                callbacks: [callback]
            };
            _topics[name][id] = topic;
            cb();
        }
        else if (topic.callbacks.indexOf(callback) < 0) {
            topic.callbacks.push(callback);
        }
    }
    function delTopic(topics, id, callback) {
        if (topics) {
            if (typeof callback === s_function) {
                var topic = topics[id];
                if (topic) {
                    var callbacks = topic.callbacks;
                    var p = callbacks.indexOf(callback);
                    if (p >= 0) {
                        callbacks[p] = callbacks[callbacks.length - 1];
                        callbacks.length--;
                    }
                    if (callbacks.length === 0) {
                        delete topics[id];
                    }
                }
            }
            else {
                delete topics[id];
            }
        }
    }
    // unsubscribe(name)
    // unsubscribe(name, callback)
    // unsubscribe(name, id)
    // unsubscribe(name, id, callback)
    function unsubscribe(name, id, callback) {
        if (typeof name !== s_string) {
            throw new TypeError('topic name must be a string.');
        }
        if (id === undefined || id === null) {
            if (typeof callback === s_function) {
                id = callback;
            }
            else {
                delete _topics[name];
                return;
            }
        }
        if (typeof id === s_function) {
            callback = id;
            id = null;
        }
        if (id === null) {
            if (_id === null) {
                if (_topics[name]) {
                    var topics = _topics[name];
                    for (id in topics) {
                        delTopic(topics, id, callback);
                    }
                }
            }
            else {
                _id.then(function(id) {
                    unsubscribe(name, id, callback);
                });
            }
        }
        else if (Future.isPromise(id)) {
            id.then(function(id) {
                unsubscribe(name, id, callback);
            });
        }
        else {
            delTopic(_topics[name], id, callback);
        }
    }
    function getId() {
        return _id;
    }
    function autoId() {
        return _invoke(self, '#', [], false);
    }
    autoId.sync = true;
    autoId.idempotent = true;
    autoId.failswitch = true;
    function addInvokeHandler(handler) {
        var oldInvokeHandler = invokeHandler;
        invokeHandler = function(name, args, context) {
            try {
                var result = handler(name, args, context, oldInvokeHandler);
                if (Future.isFuture(result)) return result;
                return Future.value(result);
            }
            catch (e) {
                return Future.error(e);
            }
        };
    }
    function addBatchInvokeHandler(handler) {
        var oldBatchInvokeHandler = batchInvokeHandler;
        batchInvokeHandler = function(batches, context) {
            try {
                var result = handler(batches, context, oldBatchInvokeHandler);
                if (Future.isFuture(result)) return result;
                return Future.value(result);
            }
            catch (e) {
                return Future.error(e);
            }
        };
    }
    function addBeforeFilterHandler(handler) {
        var oldBeforeFilterHandler = beforeFilterHandler;
        beforeFilterHandler = function(request, context) {
            try {
                var response = handler(request, context, oldBeforeFilterHandler);
                if (Future.isFuture(response)) return response;
                return Future.value(response);
            }
            catch (e) {
                return Future.error(e);
            }
        };
    }
    function addAfterFilterHandler(handler) {
        var oldAfterFilterHandler = afterFilterHandler;
        afterFilterHandler = function(request, context) {
            try {
                var response = handler(request, context, oldAfterFilterHandler);
                if (Future.isFuture(response)) return response;
                return Future.value(response);
            }
            catch (e) {
                return Future.error(e);
            }
        };
    }
    /* function constructor */ {
        if (typeof(uri) === s_string) {
            _uris = [uri];
            _index = 0;
            useService(uri, functions);
        }
        else if (Array.isArray(uri)) {
            _uris = uri;
            _index = Math.floor(Math.random() * _uris.length);
            useService(_uris[_index], functions);
        }
    }
    Object.defineProperties(this, {
        '#': { value: autoId },
        onError: { get: getOnError, set: setOnError },
        onerror: { get: getOnError, set: setOnError },
        uri: { get: getUri },
        id: { get: getId },
        failswitch: { get: getFailswitch, set: setFailswitch },
        timeout: { get: getTimeout, set: setTimeout },
        retry: { get: getRetry, set: setRetry },
        idempotent: { get: getIdempotent, set: setIdempotent },
        keepAlive: { get: getKeepAlive, set: setKeepAlive },
        byref: { get: getByRef, set: setByRef },
        simple: { get: getSimpleMode, set: setSimpleMode },
        useHarmonyMap: { get: getUseHarmonyMap, set: setUseHarmonyMap },
        options: { get: getOptions },
        setOption: { value: setOption },
        filter: { get: getFilter, set: setFilter },
        addFilter: { value: addFilter },
        removeFilter: { value: removeFilter },
        useService: { value: useService },
        invoke: { value: invoke },
        beginBatch: { value: beginBatch },
        endBatch: { value: endBatch },
        ready: { value: ready },
        subscribe: {value: subscribe },
        unsubscribe: {value: unsubscribe },
        addInvokeHandler: { value: addInvokeHandler },
        addBatchInvokeHandler: { value: addBatchInvokeHandler },
        addBeforeFilterHandler: { value: addBeforeFilterHandler },
        addAfterFilterHandler: { value: addAfterFilterHandler }
    });
}

function checkuri(uri) {
    var protocol = parse(uri).protocol;
    if (protocol === 'http:' ||
        protocol === 'https:' ||
        protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:' ||
        protocol === 'ws:' ||
        protocol === 'wss:') {
        return;
    }
    throw new Error('The ' + protocol + ' client isn\'t implemented.');
}

function create(uri, functions) {
    try {
        return global.hprose.HttpClient.create(uri, functions);
    }
    catch(e) {}
    try {
        return global.hprose.SocketClient.create(uri, functions);
    }
    catch(e) {}
    try {
        return global.hprose.WebSocketClient.create(uri, functions);
    }
    catch(e) {}
    if (typeof uri === 'string') {
        checkuri(uri);
    }
    else if (Array.isArray(uri)) {
        uri.forEach(function(uri) { checkuri(uri); });
        throw new Error('Not support multiple protocol.');
    }
    throw new Error('You should set server uri first!');
}

Object.defineProperty(Client, 'create', { value: create });

util.inherits(Client, EventEmitter);

global.hprose.Client = Client;
