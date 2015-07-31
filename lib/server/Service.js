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
 * hprose/server/Service.js                               *
 *                                                        *
 * Hprose Service for Node.js.                            *
 *                                                        *
 * LastModified: Jul 25, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var setImmediate = global.setImmediate;
var Future = global.hprose.Future;
var ResultMode = global.hprose.ResultMode;
var Tags = global.hprose.Tags;
var BytesIO = global.hprose.BytesIO;
var Reader = global.hprose.Reader;
var Writer = global.hprose.Writer;

function callService(args, context) {
    if (context.oneway) {
        setImmediate(function() {
            context.method.apply(context.scope, args);
        });
        if (context.async) {
            args[args.length - 1](null);
        }
        return null;
    }
    return context.method.apply(context.scope, args);
}

function getFuncName(func, obj) {
    var f = func.toString();
    var funcname = f.substr(0, f.indexOf('(')).replace(/(^\s*function\s*)|(\s*$)/ig, '');
    if ((funcname === '') && obj) {
        for (var name in obj) {
            if (obj[name] === func) return name;
        }
    }
    return funcname;
}

var nextid = 0;
function getNextId() {
    return (nextid < 0x7fffffff) ? ++nextid : nextid = 0;
}

function Service() {
    EventEmitter.call(this);

    var _calls = {};
    var _names = [];
    var _filters = [];
    var _onBeforeInvoke = null;
    var _onAfterInvoke = null;
    var _onSendError = null;
    var _timeout = 120000;
    var _heartbeat = 3000;
    var _simple = false;
    var _debug = false;
    var _passContext = false;
    var _topics = {};
    var _events = {};

    var self = this;
    function inputFilter(data, context) {
        for (var i = _filters.length - 1; i >= 0; i--) {
            data = _filters[i].inputFilter(data, context);
        }
        return data;
    }

    function outputFilter(data, context) {
        for (var i = 0, n = _filters.length; i < n; i++) {
            data = _filters[i].outputFilter(data, context);
        }
        return data;
    }

    function getBeforeInvoke() {
        return _onBeforeInvoke;
    }

    function setBeforeInvoke(value) {
        if (value === null || typeof value === 'function') {
            _onBeforeInvoke = value;
        }
        else {
            throw new Error('onBeforeInvoke must be a function or null.');
        }
    }

    function getAfterInvoke() {
        return _onAfterInvoke;
    }

    function setAfterInvoke(value) {
        if (value === null || typeof value === 'function') {
            _onAfterInvoke = value;
        }
        else {
            throw new Error('onAfterInvoke must be a function or null.');
        }
    }

    function getSendError() {
        return _onSendError;
    }

    function setSendError(value) {
        if (value === null || typeof value === 'function') {
            _onSendError = value;
        }
        else {
            throw new Error('onSendError must be a function or null.');
        }
    }

    function sendError(error, context) {
        if (!util.isError(error)) {
            error = new Error(error);
        }
        self.emit('sendError', error, context);
        if (_onSendError !== null) {
            _onSendError(error, context);
        }
        var stream = new BytesIO();
        var writer = new Writer(stream, true);
        stream.writeByte(Tags.TagError);
        writer.writeString(_debug ? error.message : error.stack);
        return stream;
    }

    function endError(error, context) {
        var stream = sendError(error, context);
        stream.writeByte(Tags.TagEnd);
        return stream.bytes;
    }

    function beforeInvoke(name, args, context) {
        self.emit('beforeInvoke', name, args, context.byref, context);
        if (_onBeforeInvoke !== null) {
            var value = _onBeforeInvoke(name, args, context.byref, context);
            if (Future.isPromise(value)) {
                return value.then(function(e) {
                    if (util.isError(e)) throw e;
                    return invoke(name, args, context);
                },
                function(e) {
                    return sendError(e, context);
                });
            }
        }
        return invoke(name, args, context);
    }

    var invokeHandler = function(name, args, context) {
        if (('*' in _calls) && (context.method === _calls['*'].method)) {
            args = [name, args];
        }
        var passContext = context.passContext;
        if (passContext === undefined) {
            passContext = _passContext;
        }
        if (context.async) {
            return Future.promise(function(resolve, reject) {
                if (passContext) args.push(context);
                args.push(function(result) {
                    if (util.isError(result)) {
                        reject(result);
                    }
                    else {
                        resolve(result);
                    }
                });
                callService(args, context);
            });
        }
        else {
            if (passContext) args.push(context);
            return callService(args, context);
        }
    };

    function invoke(name, args, context) {
        var result = invokeHandler(name, args, context);
        if (Future.isPromise(result)) {
            return result.then(function(result) {
                if (util.isError(result)) throw result;
                return afterInvoke(name, args, context, result);
            });
        }
        return afterInvoke(name, args, context, result);
    }

    function afterInvoke(name, args, context, result) {
        self.emit('afterInvoke', name, args, context.byref, result, context);
        if (_onAfterInvoke !== null) {
            var value = _onAfterInvoke(name, args, context.byref, result, context);
            if (Future.isPromise(value)) {
                return value.then(function(e) {
                    if (util.isError(e)) throw e;
                    return doOutput(args, context, result);
                });
            }
        }
        return doOutput(args, context, result);
    }

    function doOutput(args, context, result) {
        var mode = context.mode;
        var simple = context.simple;
        if (simple === undefined) {
            simple = _simple;
        }
        if (mode === ResultMode.RawWithEndTag || mode === ResultMode.Raw) {
            return result;
        }
        var output = new BytesIO();
        var writer = new Writer(output, simple);
        output.writeByte(Tags.TagResult);
        if (mode === ResultMode.Serialized) {
            output.write(result);
        }
        else {
            writer.reset();
            writer.serialize(result);
        }
        if (context.byref) {
            output.writeByte(Tags.TagArgument);
            writer.reset();
            writer.writeList(args);
        }
        return output.bytes;
    }

    function doInvoke(input, context) {
        var results = [];
        var reader = new Reader(input);
        var tag;
        do {
            reader.reset();
            var name = reader.readString();
            var alias = name.toLowerCase();
            var call = _calls[alias] || _calls['*'];
            if (!call) {
                throw new Error('Can\'t find this function ' + name + '().');
            }
            for (var key in call) context[key] = call[key];
            var args = [];
            context.byref = false;
            tag = input.readByte();
            if (tag === Tags.TagList) {
                reader.useHarmonyMap = context.useHarmonyMap;
                reader.reset();
                args = reader.readListWithoutTag();
                tag = input.readByte();
                if (tag === Tags.TagTrue) {
                    context.byref = true;
                    tag = input.readByte();
                }
            }
            if (tag !== Tags.TagEnd &&
                tag !== Tags.TagCall) {
                throw new Error('Unknown tag: ' + tag + '\r\n' +
                                         'with following data: ' + input.toString());
            }
            results.push(beforeInvoke(name, args, context));
        } while (tag === Tags.TagCall);
        return Future.reduce(results, function(output, result) {
            output.write(result);
            return output;
        }, new BytesIO()).then(function(output) {
            output.writeByte(Tags.TagEnd);
            return output.bytes;
        });
    }

    function doFunctionList(context) {
        var stream = new BytesIO();
        var writer = new Writer(stream, true);
        stream.writeByte(Tags.TagFunctions);
        writer.writeList(_names);
        stream.writeByte(Tags.TagEnd);
        return stream.bytes;
    }

    var beforeFilterHandler = function(request, context) {
        var response;
        try {
            request = inputFilter(request, context);
            response = afterFilterHandler(request, context);
        }
        catch (e) {
            response = endError(e, context);
        }
        if (Future.isPromise(response)) {
            return response.then(function(response) {
                return outputFilter(response, context);
            });
        }
        else {
            return outputFilter(response, context);
        }
    };

    var afterFilterHandler = function(request, context) {
        var input = new BytesIO(request);
        switch (input.readByte()) {
            case Tags.TagCall: return doInvoke(input, context);
            case Tags.TagEnd: return doFunctionList(context);
            default: throw new Error('Wrong Request: \r\n' + BytesIO.toString(request));
        }
    };

    function defaultHandle(request, context) {
        context.clients = Object.create(null, {
            idlist: { value: idlist },
            exist: { value: exist },
            broadcast: { value: broadcast },
            multicast: { value: multicast },
            unicast: { value: unicast },
            push: { value: push }
        });
        return beforeFilterHandler(request, context);
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

    function getHeartbeat() {
        return _heartbeat;
    }

    function setHeartbeat(value) {
        if (typeof(value) === 'number') {
            _heartbeat = value | 0;
        }
        else {
            _timeout = 0;
        }
    }

    function isDebugEnabled() {
        return _debug;
    }

    function setDebugEnabled(value) {
        _debug = !!value;
    }

     function getSimpleMode() {
        return _simple;
    }

    function setSimpleMode(value) {
        _simple = !!value;
    }

    function getPassContext() {
       return _passContext;
   }

   function setPassContext(value) {
       _passContext = !!value;
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

    function addFunction(func, alias, options) {
        if (typeof(func) !== 'function') {
            throw new Error('Argument func must be a function');
        }
        options = options || {};
        if (options.mode === undefined) {
            options.mode = ResultMode.Normal;
        }
        if (alias === undefined || alias === null || alias === '') {
            alias = getFuncName(func);
            if (alias === '') {
                throw new Error('Need an alias');
            }
        }
        if (typeof(alias) === 'string') {
            var name = alias.toLowerCase();
            if (_calls[name] === undefined) {
                _names.push(alias);
            }
            _calls[name] = {
                method: func,
                scope: null,
                mode: options.mode,
                simple: options.simple,
                oneway: !!options.oneway,
                async: !!options.async,
                useHarmonyMap: !!options.useHarmonyMap,
                passContext: options.passContext
            };
        }
        else {
            throw new Error('Argument alias must be a string');
        }
    }

    function addAsyncFunction(func, alias, options) {
        options = options || {};
        options.async = true;
        addFunction(func, alias, options);
    }

    function addMissingFunction(func, options) {
        addFunction(func, '*', options);
    }

    function addAsyncMissingFunction(func, options) {
        options = options || {};
        options.async = true;
        addMissingFunction(func, options);
    }

    function addFunctions(funcs, aliases, options) {
        var i;
        if (aliases === undefined || aliases === null || aliases === '') {
            for (i in funcs) {
                addFunction(funcs[i], null, options);
            }
        }
        else {
            if (funcs.length !== aliases.length) {
                throw new Error('The count of functions is not matched with aliases');
            }
            for (i in funcs) {
                addFunction(funcs[i], aliases[i], options);
            }
        }
    }

    function addAsyncFunctions(funcs, aliases, options) {
        options = options || {};
        options.async = true;
        addFunctions(funcs, aliases, options);
    }

    function addMethod(method, obj, alias, options) {
        if (obj === undefined || obj === null) {
            addFunction(method, alias, options);
            return;
        }
        if (typeof(method) !== 'function' &&
            typeof(obj[method]) !== 'function') {
                throw new Error('method or obj[method] must be a function');
        }
        options = options || {};
        if (options.scope === undefined) {
            options.scope = obj;
        }
        if (options.mode === undefined) {
            options.mode = ResultMode.Normal;
        }
        if (alias === undefined || alias === null) {
            switch(typeof(method)) {
                case 'string':
                    alias = method;
                    method = obj[method];
                    break;
                case 'function':
                    alias = getFuncName(method, obj);
                    if (alias === '') {
                        throw new Error('Need an alias');
                    }
                    break;
                default:
                    throw new Error('Need an alias');
            }
        }
        if (typeof(alias) === 'string') {
            var name = alias.toLowerCase();
            if (_calls[name] === undefined) {
                _names.push(alias);
            }
            _calls[name] = {
                method: method,
                scope: options.scope,
                mode: options.mode,
                simple: options.simple,
                oneway: !!options.oneway,
                async: !!options.async,
                useHarmonyMap: !!options.useHarmonyMap,
                passContext: options.passContext
            };
        }
        else {
            throw new Error('Argument alias must be a string');
        }
    }

    function addAsyncMethod(method, obj, alias, options) {
        options = options || {};
        options.async = true;
        addMethod(method, obj, alias, options);
    }

    function addMissingMethod(method, obj, options) {
        addMethod(method, obj, '*', options);
    }

    function addAsyncMissingMethod(method, obj, options) {
        options = options || {};
        options.async = true;
        addMissingMethod(method, obj, options);
    }

    function addMethods(methods, obj, aliases, options) {
        var i;
        if (aliases === undefined || aliases === null || aliases === '') {
            for (i in methods) {
                addMethod(methods[i], obj, null, options);
            }
        }
        else {
            if (methods.length !== aliases.length) {
                throw new Error('The count of methods is not matched with aliases');
            }
            for (i in methods) {
                addMethod(methods[i], obj, aliases[i], options);
            }
        }
    }

    function addAsyncMethods(methods, obj, aliases, options) {
        options = options || {};
        options.async = true;
        addMethods(methods, obj, aliases, options);
    }

    function addInstanceMethods(obj, aliasPrefix, options) {
        var alias;
        for (var name in obj) {
            alias = (aliasPrefix ? aliasPrefix + '_' + name : name);
            if (typeof(obj[name]) === 'function') {
                addMethod(obj[name], obj, alias, options);
            }
        }
    }

    function addAsyncInstanceMethods(obj, aliasPrefix, options) {
        options = options || {};
        options.async = true;
        addInstanceMethods(obj, aliasPrefix, options);
    }

    function add() {
        var args = arguments;
        switch (args.length) {
            case 1: {
                if (typeof(args[0]) === 'function') {
                    addFunction(args[0]);
                }
                else if (typeof(args[0]) === 'string') {
                    addFunction(global[args[0]], args[0]);
                }
                else if (util.isArray(args[0])) {
                    addFunctions(args[0]);
                }
                else {
                    addInstanceMethods(args[0]);
                }
                return;
            }
            case 2: {
                if (typeof(args[0]) === 'function' &&
                    typeof(args[1]) === 'string') {
                    addFunction(args[0], args[1]);
                }
                else if (typeof(args[0]) === 'string' &&
                         typeof(args[1]) === 'string') {
                    addFunction(global[args[0]], args[1]);
                }
                else if (util.isArray(args[0])) {
                    if (util.isArray(args[1])) {
                        addFunctions(args[0], args[1]);
                    }
                    else {
                        addMethods(args[0], args[1]);
                    }
                }
                else if (typeof(args[1]) === 'string') {
                    addInstanceMethods(args[0], args[1]);
                }
                return;
            }
            case 3: {
                if (typeof(args[0]) === 'function' &&
                    typeof(args[2]) === 'string' &&
                    !args[1]) {
                    addFunction(args[0], args[2]);
                }
                else if (typeof(args[0]) === 'string' &&
                         typeof(args[2]) === 'string') {
                    if (args[1]) {
                        addMethod(args[0], args[1], args[2]);
                    }
                    else {
                        addFunction(global[args[0]], args[2]);
                    }
                }
                else if (util.isArray(args[0])) {
                    if (util.isArray(args[2]) && !args[1]) {
                        addFunctions(args[0], args[2]);
                    }
                    else {
                        addMethods(args[0], args[1], args[2]);
                    }
                }
                else {
                    addInstanceMethods(args[0], args[1], args[2]);
                }
                return;
            }
        }
        throw new Error('Wrong arguments');
    }

    function addAsync() {
        var args = arguments;
        switch (args.length) {
            case 1: {
                if (typeof(args[0]) === 'function') {
                    addAsyncFunction(args[0]);
                }
                else if (typeof(args[0]) === 'string') {
                    addAsyncFunction(global[args[0]], args[0]);
                }
                else if (util.isArray(args[0])) {
                    addAsyncFunctions(args[0]);
                }
                else {
                    addAsyncInstanceMethods(args[0]);
                }
                return;
            }
            case 2: {
                if (typeof(args[0]) === 'function' &&
                    typeof(args[1]) === 'string') {
                    addAsyncFunction(args[0], args[1]);
                }
                else if (typeof(args[0]) === 'string' &&
                         typeof(args[1]) === 'string') {
                    addAsyncFunction(global[args[0]], args[1]);
                }
                else if (util.isArray(args[0])) {
                    if (util.isArray(args[1])) {
                        addAsyncFunctions(args[0], args[1]);
                    }
                    else {
                        addAsyncMethods(args[0], args[1]);
                    }
                }
                else if (typeof(args[1]) === 'string') {
                    addAsyncInstanceMethods(args[0], args[1]);
                }
                return;
            }
            case 3: {
                if (typeof(args[0]) === 'function' &&
                    typeof(args[2]) === 'string' &&
                    !args[1]) {
                    addAsyncFunction(args[0], args[2]);
                }
                else if (typeof(args[0]) === 'string' &&
                         typeof(args[2]) === 'string') {
                    if (args[1]) {
                        addAsyncMethod(args[0], args[1], args[2]);
                    }
                    else {
                        addAsyncFunction(global[args[0]], args[2]);
                    }
                }
                else if (util.isArray(args[0])) {
                    if (util.isArray(args[2]) && !args[1]) {
                        addAsyncFunctions(args[0], args[2]);
                    }
                    else {
                        addAsyncMethods(args[0], args[1], args[2]);
                    }
                }
                else {
                    addAsyncInstanceMethods(args[0], args[1], args[2]);
                }
                return;
            }
        }
        throw new Error('Wrong arguments');
    }

    function delTimer(topics, id) {
        if ('timer' in topics[id]) {
            global.clearTimeout(topics[id].timer);
            delete topics[id].timer;
        }
    }

    function resetTimer(topic, id) {
        var topics = getTopics(topic);
        delTimer(topics, id);
        topics[id].timer = global.setTimeout(function() {
            global.clearTimeout(topics[id].timer);
            delete topics[id].timer;
            var messages = topics[id].messages;
            delete topics[id];
            messages.forEach(function(message) {
                message.detector.resolve(false);
            });
            if (_events[topic] instanceof EventEmitter) {
                _events[topic].emit('unsubscribe', id, self);
            }
            else {
                self.emit('unsubscribe', topic, id, self);
            }
        }, _heartbeat);
    }

    function setRequestTimeout(request, timeout) {
        if (timeout > 0) {
            return request.timeout(timeout).catchError(function() {});
        }
        return request;
    }

    function publish(topic, timeout, events) {
        if (Array.isArray(topic)) {
            topic.forEach(function(t) {
                publish(t, timeout);
            });
            return;
        }
        if (timeout === undefined) {
            timeout = _timeout;
        }
        if (timeout instanceof EventEmitter) {
            events = timeout;
            timeout = _timeout;
        }
        if (typeof(timeout) === 'number') {
            timeout = timeout | 0;
        }
        else {
            timeout = 0;
        }
        _topics[topic] = {};
        _events[topic] = events;
        addFunction(function(id) {
            var topics = _topics[topic];
            if (id in topics) {
                var messages = topics[id].messages;
                if (messages.length > 0) {
                    var message = messages.shift();
                    message.detector.resolve(true);
                    resetTimer(topic, id);
                    return message.result;
                }
                else {
                    delTimer(topics, id);
                }
            }
            else {
                topics[id] = { messages: [] };
                setImmediate(function() {
                    if (_events[topic] instanceof EventEmitter) {
                        _events[topic].emit('subscribe', id, self);
                    }
                    else {
                        self.emit('subscribe', topic, id, self);
                    }
                });
            }
            var request;
            if ('request' in topics[id]) {
                request = topics[id].request;
                if (request.inspect().state === 'pending') {
                    return setRequestTimeout(request, timeout);
                }
            }
            request = new Future();
            topics[id].request = request;
            return setRequestTimeout(request, timeout);
        }, topic);
    }

    function getTopics(topic) {
        if (!(topic in _topics)) {
            throw new Error('topic "' + topic + '" is not published.');
        }
        return _topics[topic];
    }
    function _push(topic, id, result) {
        var topics = getTopics(topic);
        if (!(id in topics)) {
            return Future.value(false);
        }
        if ('request' in topics[id]) {
            topics[id].request.resolve(result);
            delete topics[id].request;
            return Future.value(true);
        }
        else {
            var detector = new Future();
            topics[id].messages.push({ detector: detector, result: result });
            resetTimer(topic, id);
            return detector;
        }
    }
    function idlist(topic) {
        return Object.keys(getTopics(topic));
    }
    function exist(topic, id) {
        return id in getTopics(topic);
    }
    function broadcast(topic, result, callback) {
        multicast(topic, idlist(topic), result, callback);
    }
    function multicast(topic, ids, result, callback) {
        if (typeof callback !== 'function') {
            ids.forEach(function(id) { _push(topic, id, result); });
            return;
        }
        var sent = [];
        var unsent = [];
        var n = ids.length;
        var count = n;
        function check(id) {
            return function(success) {
                if (success) {
                    sent.push(id);
                }
                else {
                    unsent.push(id);
                }
                if (--count === 0) {
                    callback(sent, unsent);
                }
            };
        }
        for (var i = 0; i < n; ++i) {
            var id = ids[i];
            if (id !== undefined) {
                _push(topic, id, result).then(check(id));
            }
            else {
                --count;
            }
        }
    }
    function unicast(topic, id, result, callback) {
        var detector = _push(topic, id, result);
        if (typeof callback === 'function') {
            detector.then(callback);
        }
    }

    // push(topic, result)
    // push(topic, ids, result)
    // push(topic, id, result)
    function push(topic) {
        var args = arguments;
        var argc = args.length;
        var id, result;
        if (argc < 2 && argc > 3) {
            throw new Error('Wrong number of arguments');
        }
        if (argc === 2) {
            result = args[1];
        }
        else {
            id = args[1];
            result = args[2];
        }
        if (typeof id === 'undefined') {
            var topics = getTopics(topic);
            for (id in topics) { _push(topic, id, result); }
        }
        else if (Array.isArray(id)) {
            id.forEach(function(id) { _push(topic, id, result); });
        }
        else {
            _push(topic, id, result);
        }
    }

    function addBeforeFilterHandler(handler) {
        var oldBeforeFilterHandler = beforeFilterHandler;
        beforeFilterHandler = function(request, context) {
            return handler(request, context, oldBeforeFilterHandler);
        };
    }
    function addAfterFilterHandler(handler) {
        var oldAfterFilterHandler = afterFilterHandler;
        afterFilterHandler = function(request, context) {
            return handler(request, context, oldAfterFilterHandler);
        };
    }
    function addInvokeHandler(handler) {
        var oldInvokeHandler = invokeHandler;
        invokeHandler = function(name, args, context) {
            return handler(name, args, context, oldInvokeHandler);
        };
    }

    addFunction(getNextId, '#', { simple: true } );

    Object.defineProperties(this, {
        doFunctionList: { value: doFunctionList },
        defaultHandle: { value: defaultHandle },
        onBeforeInvoke: { get: getBeforeInvoke, set: setBeforeInvoke },
        onAfterInvoke: { get: getAfterInvoke, set: setAfterInvoke },
        onSendError: { get: getSendError, set: setSendError },
        timeout: { get: getTimeout, set: setTimeout },
        heartbeat: { get: getHeartbeat, set: setHeartbeat },
        debug: { get: isDebugEnabled, set: setDebugEnabled },
        simple: { get: getSimpleMode, set: setSimpleMode },
        passContext: { get: getPassContext, set: setPassContext },
        filter: { get: getFilter, set: setFilter },
        addFilter: { value: addFilter },
        removeFilter: { value: removeFilter },
        addFunction: { value: addFunction },
        addAsyncFunction: { value: addAsyncFunction },
        addMissingFunction: { value: addMissingFunction },
        addAsyncMissingFunction: { value: addAsyncMissingFunction },
        addFunctions: { value: addFunctions },
        addAsyncFunctions: { value: addAsyncFunctions },
        addMethod: { value: addMethod },
        addAsyncMethod: { value: addAsyncMethod },
        addMissingMethod: { value: addMissingMethod },
        addAsyncMissingMethod: { value: addAsyncMissingMethod },
        addMethods: { value: addMethods },
        addAsyncMethods: { value: addAsyncMethods },
        addInstanceMethods: { value: addInstanceMethods },
        addAsyncInstanceMethods: { value: addAsyncInstanceMethods },
        add: { value: add },
        addAsync: { value: addAsync },
        publish: { value: publish },
        broadcast: { value: broadcast },
        multicast: { value: multicast },
        unicast: { value: unicast },
        push: { value: push },
        idlist: { value: idlist },
        exist: { value: exist },
        addBeforeFilterHandler: { value: addBeforeFilterHandler },
        addAfterFilterHandler: { value: addAfterFilterHandler },
        addInvokeHandler: { value: addInvokeHandler }
    });
}

util.inherits(Service, EventEmitter);

global.hprose.Service = Service;
