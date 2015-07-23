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
 * LastModified: Jul 20, 2015                             *
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
function pass(id) { return id; }

var s_boolean = 'boolean';
var s_string = 'string';
var s_number = 'number';
var s_function = 'function';
var s_object = 'object';
var s_undefined = 'undefined';

function HproseProxy(invoke, ns) {
    this.get = function(proxy, name) {
        if (ns) name = ns + '_' + name;
        return Proxy.createFunction(
            new HproseProxy(invoke, name),
            function () {
                return invoke(this, name, slice(arguments));
            }
        );
    };
}

function Client(uri, functions) {
    EventEmitter.call(this);

    // private members
    var _uri;
    var _byref              = false;
    var _simple             = false;
    var _timeout            = 30000;
    var _retry              = 3;
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

    function sendAndReceive(env, onsuccess, onerror) {
        var request = env.data;
        var context = {client: self, userdata: {}};
        for (var i = 0, n = _filters.length; i < n; i++) {
            request = _filters[i].outputFilter(request, context);
        }
        self.sendAndReceive(request, env).then(function(response) {
            if (env.oneway) return;
            for (var i = _filters.length - 1; i >= 0; i--) {
                response = _filters[i].inputFilter(response, context);
            }
            return response;
        }).then(onsuccess, function(e) {
            if (retry(env, onsuccess, onerror)) return;
            onerror(e);
        });
    }

    function retry(env, onsuccess, onerror) {
        if (env.idempotent) {
            if (--env.retry >= 0) {
                var interval = (10 - env.retry) * 500;
                if (env.retry > 10) interval = 500;
                global.setTimeout(function() {
                    sendAndReceive(env, onsuccess, onerror);
                }, interval);
                return true;
            }
        }
        return false;
    }

    function initService(stub) {
        var env = {
            data: GETFUNCTIONS,
            retry: _retry,
            idempotent: true,
            timeout: _timeout,
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
        sendAndReceive(env, onsuccess, _ready.reject);
    }

    function setFunction(stub, func) {
        return Future.wrap(function() {
            return _invoke(stub, func, slice(arguments));
        });
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

    function getenv(args, env) {
        var i = 0, n = args.length;
        for (; i < n; ++i) {
            if (typeof args[i] === s_function) break;
        }
        if (i === n) return;
        var extra = args.splice(i, n - i);
        env.onsuccess = extra[0];
        n = extra.length;
        for (i = 1; i < n; ++i) {
            var arg = extra[i];
            switch (typeof arg) {
            case s_function:
                env.onerror = arg; break;
            case s_boolean:
                env.byref = arg; break;
            case s_number:
                env.mode = arg; break;
            case s_object:
                for (var key in arg) {
                    if (key in env) {
                        env[key] = arg[key];
                    }
                }
                break;
            }
        }
    }

    function _invoke(stub, func, args) {
        var future = new Future();
        if (_lock) {
            _tasks.push({ args: [stub, func, args], result: future });
            return future;
        }
        var stream;
        var env = {
            mode: ResultMode.Normal,
            byref: _byref,
            simple: _simple,
            timeout: _timeout,
            retry: _retry,
            idempotent: false,
            oneway: false,
            sync: false,
            onsuccess: undefined,
            onerror: undefined,
            useHarmonyMap: _useHarmonyMap
        };
        if (stub) {
            if (func in stub) {
                var method = stub[func];
                for (var key in method) {
                    if (key in env) {
                        env[key] = method[key];
                    }
                }
            }
            getenv(args, env);
            if (_batch) {
                if (env.mode === ResultMode.RawWithEndTag) {
                    throw new Error("ResultMode.RawWithEndTag doesn't support in batch mode.");
                }
                else if (env.mode === ResultMode.Raw) {
                    throw new Error("ResultMode.Raw doesn't support in batch mode.");
                }
            }
            else {
                if (env.sync) _lock = true;
            }
            stream = new BytesIO();
            stream.writeByte(Tags.TagCall);
            var writer = new Writer(stream, env.simple);
            writer.writeString(func);
            if (args.length > 0 || env.byref) {
                writer.reset();
                writer.writeList(args);
                if (env.byref) {
                    writer.writeBoolean(true);
                }
            }
            if (_batch) {
                _batches.push({args: args,
                               func: func,
                               data: stream.bytes,
                               env: env,
                               future: future});
            }
            else {
                stream.writeByte(Tags.TagEnd);
            }
        }

        if (!_batch) {
            var batchSize = _batches.length;
            var batch = !!batchSize;
            var request = new BytesIO();
            if (batch) {
                for (var i = 0; i < batchSize; ++i) {
                    request.write(_batches[i].data);
                    delete _batches[i].data;
                }
                request.writeByte(Tags.TagEnd);
            }
            else {
                request = stream;
            }

            var batches = _batches;
            _batches = [];

            env.data = request.bytes;

            var onsuccess = function(response) {
                if (env.oneway) {
                    future.resolve();
                    if (env.onsuccess) {
                        env.onsuccess(undefined, args);
                    }
                    return;
                }
                var result = null;
                var error = null;
                var i;
                if (env.mode === ResultMode.RawWithEndTag) {
                    result = response;
                }
                else if (env.mode === ResultMode.Raw) {
                    result = response.subarray(0, response.byteLength - 1);
                }
                else {
                    var stream = new BytesIO(response);
                    var reader = new Reader(stream, false, env.useHarmonyMap);
                    var tag;
                    i = -1;
                    try {
                        while ((tag = stream.readByte()) !== Tags.TagEnd) {
                            switch (tag) {
                            case Tags.TagResult:
                                var mode = env.mode;
                                if (batch) {
                                    mode = batches[i + 1].env.mode;
                                }
                                if (mode === ResultMode.Serialized) {
                                    result = reader.readRaw();
                                }
                                else {
                                    reader.reset();
                                    result = reader.unserialize();
                                }
                                if (batch) {
                                    batches[++i].result = result;
                                    batches[i].error = null;
                                }
                                break;
                            case Tags.TagArgument:
                                reader.reset();
                                var _args = reader.readList();
                                if (batch) {
                                    copyargs(_args, batches[i].args);
                                }
                                else {
                                    copyargs(_args, args);
                                }
                                break;
                            case Tags.TagError:
                                reader.reset();
                                error = new Error(reader.readString());
                                if (batch) {
                                    batches[++i].error = error;
                                }
                                break;
                            default:
                                error = new Error('Wrong Response:\r\n' + BytesIO.toString(response));
                                if (batch) {
                                    batches[++i].error = error;
                                }
                                break;
                            }
                        }
                    }
                    catch (e) {
                        error = e;
                        if (batch) {
                            batches[i < 0 ? 0 : i >= batchSize ? i - 1 : i].error = error;
                        }
                    }
                }
                if (!batch) {
                    batchSize  = 1;
                    batches = [{args: args,
                                func: func,
                                env: env,
                                result: result,
                                error: error,
                                future: future}];
                }
                for (i = 0; i < batchSize; ++i) {
                    var item = batches[i];
                    try {
                        if (item.error) {
                            if (item.env.onerror) {
                                item.result = item.env.onerror(item.func, item.error);
                                item.future.resolve(item.result);
                            }
                            else {
                                _onerror(item.func, item.error);
                                self.emit('error', item.func, item.error);
                                item.future.reject(item.error);
                            }
                        }
                        else {
                            if (item.env.onsuccess) {
                                try {
                                    item.result = item.env.onsuccess(item.result, item.args);
                                }
                                catch (e) {
                                    if (item.env.onerror) {
                                        item.result = item.env.onerror(item.func, e);
                                    }
                                    else {
                                        item.future.reject(e);
                                    }
                                }
                            }
                            item.future.resolve(item.result);
                        }
                    }
                    catch (e) {
                        item.future.reject(e);
                    }
                }
            };
            var onerror = function(error) {
                try {
                    if (env.onerror) {
                        var result = env.onerror(func, error);
                        future.resolve(result);
                    }
                    else {
                        _onerror(func, error);
                        self.emit('error', func, error);
                        future.reject(error);
                    }
                }
                catch (e) {
                    future.reject(e);
                }
            };
            sendAndReceive(env, onsuccess, onerror);
        }
        future.whenComplete(function() {
            if (env.sync) {
                _lock = false;
                setImmediate(function(tasks) {
                    tasks.forEach(function(task) {
                        _invoke.apply(self, task.args).then(task.result.resolve, task.result.reject);
                    });
                }, _tasks);
                _tasks = [];
            }
        });
        return future;
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
            stub = Proxy.create(new HproseProxy(_invoke));
        }
        _ready.resolve(stub);
        return stub;
    }
    function invoke() {
        var args = slice(arguments);
        var func = args.shift();
        return _invoke(self, func, args);
    }
    function beginBatch() {
        _batch = true;
    }
    function endBatch() {
        _batch = false;
        if (_batches.length) {
            _invoke();
        }
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
                _id = invoke('#', pass, { sync: true });
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
                invoke(name, id, topic.handler, cb, { timeout: timeout });
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
    /* function constructor */ {
        if (typeof(uri) === s_string) {
            useService(uri, functions);
        }
    }
    Object.defineProperties(this, {
        onError: { get: getOnError, set: setOnError },
        onerror: { get: getOnError, set: setOnError },
        uri: { get: getUri },
        id: { get: getId },
        timeout: { get: getTimeout, set: setTimeout },
        retry: { get: getRetry, set: setRetry },
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
        unsubscribe: {value: unsubscribe }
    });
}

function create(uri, functions) {
    var protocol = parse(uri).protocol;
    if (protocol === 'http:' ||
        protocol === 'https:') {
        return new global.hprose.HttpClient(uri, functions);
    }
    if (protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:') {
        return new global.hprose.SocketClient(uri, functions);
    }
    if (protocol === 'ws:' ||
        protocol === 'wss:') {
        return new global.hprose.WebSocketClient(uri, functions);
    }
    throw new Error('The ' + protocol + ' client isn\'t implemented.');
}

Object.defineProperty(Client, 'create', { value: create });

util.inherits(Client, EventEmitter);

global.hprose.Client = Client;
