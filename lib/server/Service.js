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
 * LastModified: Aug 9, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var TimeoutError = require('../common/TimeoutError');

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

    var _calls                  = {},
        _names                  = [],
        _filters                = [],
        _onBeforeInvoke         = null,
        _onAfterInvoke          = null,
        _onSendError            = null,
        _timeout                = 120000,
        _heartbeat              = 3000,
        _errorDelay             = 10000,
        _simple                 = false,
        _debug                  = false,
        _passContext            = false,
        _topics                 = {},
        _events                 = {},
        _invokeHandler          = invokeHandler,
        _beforeFilterHandler    = beforeFilterHandler,
        _afterFilterHandler     = afterFilterHandler,
        _invokeHandlers         = [],
        _beforeFilterHandlers   = [],
        _afterFilterHandlers    = [],

        self = this;

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
        try {
            self.emit('sendError', error, context);
            if (_onSendError !== null) {
                var e = _onSendError(error, context);
                if (util.isError(e)) {
                    error = e;
                }
            }
        }
        catch(e) {
            error = e;
        }
        var stream = new BytesIO();
        var writer = new Writer(stream, true);
        stream.writeByte(Tags.TagError);
        writer.writeString(_debug ? error.stack : error.message);
        return stream;
    }

    function endError(error, context) {
        var stream = sendError(error, context);
        stream.writeByte(Tags.TagEnd);
        return stream.bytes;
    }

    function beforeInvoke(name, args, context) {
        try {
            self.emit('beforeInvoke', name, args, context.byref, context);
            if (_onBeforeInvoke !== null) {
                var value = _onBeforeInvoke(name, args, context.byref, context);
                if (util.isError(value)) throw value;
                if (Future.isPromise(value)) {
                    return value.then(function(e) {
                        if (util.isError(e)) throw e;
                        return invoke(name, args, context);
                    }).catch(function(e) {
                        return sendError(e, context);
                    });
                }
            }
            return invoke(name, args, context);
        }
        catch (e) {
            return sendError(e, context);
        }
    }

    function invokeHandler(name, args, context) {
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
    }

    function invoke(name, args, context) {
        var result = _invokeHandler(name, args, context);
        if (Future.isPromise(result)) {
            return result.then(function(result) {
                if (util.isError(result)) throw result;
                return afterInvoke(name, args, context, result);
            });
        }
        return afterInvoke(name, args, context, result);
    }

    function afterInvoke(name, args, context, result) {
        args = args.slice();
        if (typeof (args[args.length - 1]) === 'function') {
            args.length--;
        }
        if (args[args.length - 1] === context) {
            args.length--;
        }
        self.emit('afterInvoke', name, args, context.byref, result, context);
        if (_onAfterInvoke !== null) {
            var value = _onAfterInvoke(name, args, context.byref, result, context);
            if (util.isError(value)) throw value;
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
            if (call) {
                for (var key in call) context[key] = call[key];
            }
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
            if (call) {
                results.push(beforeInvoke(name, args, context));
            }
            else {
                results.push(sendError(new Error('Can\'t find this function ' + name + '().'), context));
            }
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

    function beforeFilterHandler(request, context) {
        var response;
        try {
            request = inputFilter(request, context);
            response = _afterFilterHandler(request, context);
        }
        catch (e) {
            response = endError(e, context);
            if (_errorDelay > 0) {
                response = Future.delayed(_errorDelay, response);
            }
        }
        if (Future.isPromise(response)) {
            return response.then(function(response) {
                return outputFilter(response, context);
            });
        }
        else {
            return outputFilter(response, context);
        }
    }

    function afterFilterHandler(request, context) {
        var input = new BytesIO(request);
        switch (input.readByte()) {
            case Tags.TagCall: return doInvoke(input, context);
            case Tags.TagEnd: return doFunctionList(context);
            default: throw new Error('Wrong Request: \r\n' + BytesIO.toString(request));
        }
    }

    function defaultHandle(request, context) {
        context.clients = Object.create(null, {
            idlist: { value: idlist },
            exist: { value: exist },
            broadcast: { value: broadcast },
            multicast: { value: multicast },
            unicast: { value: unicast },
            push: { value: push }
        });
        return _beforeFilterHandler(request, context);
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
            _heartbeat = 0;
        }
    }

    function getErrorDelay() {
        return _errorDelay;
    }

    function setErrorDelay(value) {
        if (typeof(value) === 'number') {
            _errorDelay = value | 0;
        }
        else {
            _errorDelay = 0;
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
        if ((options === undefined) && (typeof alias === 'object')) {
            options = alias;
            alias = null;
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

    function addAsyncFunction(func, alias, options) {
        if ((options === undefined) && (typeof alias === 'object')) {
            options = alias;
            alias = null;
        }
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
        if ((options === undefined) && (typeof aliases === 'object')) {
            options = aliases;
            aliases = null;
        }
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
        if ((options === undefined) && (typeof aliases === 'object')) {
            options = aliases;
            aliases = null;
        }
        options = options || {};
        options.async = true;
        addFunctions(funcs, aliases, options);
    }

    function addMethod(method, obj, alias, options) {
        if ((options === undefined) && (typeof alias === 'object')) {
            options = alias;
            alias = null;
        }
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
        if ((options === undefined) && (typeof alias === 'object')) {
            options = alias;
            alias = null;
        }
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
        if ((options === undefined) && (typeof aliases === 'object')) {
            options = aliases;
            aliases = null;
        }
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
        if ((options === undefined) && (typeof aliases === 'object')) {
            options = aliases;
            aliases = null;
        }
        options = options || {};
        options.async = true;
        addMethods(methods, obj, aliases, options);
    }

    function addInstanceMethods(obj, aliasPrefix, options) {
        if ((options === undefined) && (typeof aliasPrefix === 'object')) {
            options = aliasPrefix;
            aliasPrefix = null;
        }
        var alias;
        for (var name in obj) {
            alias = (aliasPrefix ? aliasPrefix + '_' + name : name);
            if (typeof(obj[name]) === 'function') {
                addMethod(obj[name], obj, alias, options);
            }
        }
    }

    function addAsyncInstanceMethods(obj, aliasPrefix, options) {
        if ((options === undefined) && (typeof aliasPrefix === 'object')) {
            options = aliasPrefix;
            aliasPrefix = null;
        }
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

    function offline(topic, id) {
        var topics = getTopics(topic);
        delTimer(topics, id);
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
    }
    function resetTimer(topic, id) {
        var topics = getTopics(topic);
        delTimer(topics, id);
        topics[id].timer = global.setTimeout(function() {
            offline(topic, id);
        }, topics[id].heartbeat);
    }
    function setRequestTimer(topic, id, request, timeout) {
        var topics = getTopics(topic);
        if (timeout > 0) {
            return request.timeout(timeout).catchError(function(e) {
                if (e instanceof TimeoutError) {
                    var checkoffline = function() {
                        topics[id].timer = global.setTimeout(
                            checkoffline,
                            topics[id].heartbeat
                        );
                        if (topics[id].count < 0) {
                            offline(topic, id);
                        }
                        else {
                            topics[id].count--;
                        }
                    };
                    checkoffline();
                }
                else {
                    topics[id].count--;
                }
            });
        }
        return request;
    }
    function publish(topic, options) {
        if (util.isArray(topic)) {
            topic.forEach(function(t) {
                publish(t, timeout);
            });
            return;
        }
        options = options || {};
        var events = (('events' in options) ? options.events : undefined),
        timeout = (('timeout' in options) ? options.timeout : _timeout),
        heartbeat = (('heartbeat' in options) ? options.heartbeat : _heartbeat);

        _topics[topic] = {};
        _events[topic] = events;
        addFunction(function(id) {
            var topics = _topics[topic];
            if (id in topics) {
                if (topics[id].count < 0) {
                    topics[id].count = 0;
                }
                var messages = topics[id].messages;
                if (messages.length > 0) {
                    var message = messages.shift();
                    message.detector.resolve(true);
                    resetTimer(topic, id);
                    return message.result;
                }
                else {
                    delTimer(topics, id);
                    topics[id].count++;
                }
            }
            else {
                topics[id] = { messages: [], count: 1, heartbeat: heartbeat };
                setImmediate(function() {
                    if (_events[topic] instanceof EventEmitter) {
                        _events[topic].emit('subscribe', id, self);
                    }
                    else {
                        self.emit('subscribe', topic, id, self);
                    }
                });
            }
            if ('request' in topics[id]) {
                topics[id].request.resolve();
            }
            var request = new Future();
            request.whenComplete(function() { topics[id].count--; });
            topics[id].request = request;
            return setRequestTimer(topic, id, request, timeout);
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
        else if (util.isArray(id)) {
            id.forEach(function(id) { _push(topic, id, result); });
        }
        else {
            _push(topic, id, result);
        }
    }
    function addBeforeFilterHandler(handler) {
        _beforeFilterHandlers.push(handler);
        _beforeFilterHandler = _beforeFilterHandlers.reduceRight(
        function(next, handler) {
            return function(request, context) {
                return handler(request, context, next);
            };
        }, beforeFilterHandler);
    }
    function addAfterFilterHandler(handler) {
        _afterFilterHandlers.push(handler);
        _afterFilterHandler = _afterFilterHandlers.reduceRight(
        function(next, handler) {
            return function(request, context) {
                return handler(request, context, next);
            };
        }, afterFilterHandler);
    }
    function addInvokeHandler(handler) {
        _invokeHandlers.push(handler);
        _invokeHandler = _invokeHandlers.reduceRight(
        function(next, handler) {
            return function(name, args, context) {
                return handler(name, args, context, next);
            };
        }, invokeHandler);
    }
    function use(handler) {
        addInvokeHandler(handler);
        return self;
    }
    var beforeFilter = Object.create(null, {
        use: { value: function(handler) {
            addBeforeFilterHandler(handler);
            return beforeFilter;
        } }
    });
    var afterFilter = Object.create(null, {
        use: { value: function(handler) {
            addAfterFilterHandler(handler);
            return afterFilter;
        } }
    });
    addFunction(getNextId, '#', { simple: true } );

    Object.defineProperties(this, {
        doFunctionList: { value: doFunctionList },
        defaultHandle: { value: defaultHandle },
        endError: { value: endError },
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
        use: { value: use },
        beforeFilter: { value: beforeFilter },
        afterFilter: { value: afterFilter }
    });
}

util.inherits(Service, EventEmitter);

global.hprose.Service = Service;
