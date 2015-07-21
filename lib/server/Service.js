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
 * LastModified: Jul 21, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Future = global.hprose.Future;
var Completer = global.hprose.Completer;
var ResultMode = global.hprose.ResultMode;
var Tags = global.hprose.Tags;
var BytesIO = global.hprose.BytesIO;
var Reader = global.hprose.Reader;
var Writer = global.hprose.Writer;

function callService(call, args) {
    return call.method.apply(call.thisArg, args);
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
    var _simple = false;
    var _debug = false;
    var _passContext = false;

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
        return outputFilter(stream.bytes, context);
    }

    function beforeInvoke(call, name, args, byref, context) {
        self.emit('beforeInvoke', name, args, byref, context);
        if (_onBeforeInvoke !== null) {
            var value = _onBeforeInvoke(name, args, byref, context);
            if (Future.isPromise(value)) {
                return value.then(function(e) {
                    if (util.isError(e)) throw e;
                    return invoke(call, name, args, byref, context);
                },
                function(e) {
                    return sendError(e, context);
                });
            }
        }
        return invoke(call, name, args, byref, context);
    }

    function invoke(call, name, args, byref, context) {
        if (call === _calls['*']) {
            args = [name, args];
        }
        var result;
        var passContext = call.passContext;
        if (passContext === undefined) {
            passContext = _passContext;
        }
        if (call.async) {
            result = Future.promise(function(resolve, reject) {
                args.push(function(result) {
                    if (util.isError(result)) {
                        reject(result);
                    }
                    else {
                        resolve(result);
                    }
                });
                if (passContext) args.push(context);
                callService(call, args);
            });
        }
        else {
            if (passContext) args.push(context);
            result = callService(call, args);
        }
        if (Future.isPromise(result)) {
            return result.then(function(result) {
                if (util.isError(result)) throw result;
                return afterInvoke(call, name, args, byref, context, result);
            });
        }
        return afterInvoke(call, name, args, byref, context, result);
    }

    function afterInvoke(call, name, args, byref, context, result) {
        self.emit('afterInvoke', name, args, byref, result, context);
        if (_onAfterInvoke !== null) {
            var value = _onAfterInvoke(name, args, byref, result, context);
            if (Future.isPromise(value)) {
                return value.then(function(e) {
                    if (util.isError(e)) throw e;
                    return doOutput(call, args, byref, context, result);
                });
            }
        }
        return doOutput(call, args, byref, context, result);
    }

    function doOutput(call, args, byref, context, result) {
        var output = new BytesIO();
        var mode = call.mode;
        var simple = call.simple;
        if (simple === undefined) {
            simple = _simple;
        }
        if (mode === ResultMode.RawWithEndTag) {
            return outputFilter(result, context);
        }
        else if (mode === ResultMode.Raw) {
            output.write(result);
        }
        else {
            var writer = new Writer(output, simple);
            output.writeByte(Tags.TagResult);
            if (mode === ResultMode.Serialized) {
                output.write(result);
            }
            else {
                writer.reset();
                writer.serialize(result);
            }
            if (byref) {
                output.writeByte(Tags.TagArgument);
                writer.reset();
                writer.writeList(args);
            }
        }
        return output;
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
            var args = [];
            var byref = false;
            var async = call.async;
            tag = input.readByte();
            if (tag === Tags.TagList) {
                reader.useHarmonyMap = call.useHarmonyMap;
                reader.reset();
                args = reader.readListWithoutTag();
                tag = input.readByte();
                if (tag === Tags.TagTrue) {
                    byref = true;
                    tag = input.readByte();
                }
            }
            if (tag !== Tags.TagEnd &&
                tag !== Tags.TagCall) {
                throw new Error('Unknown tag: ' + tag + '\r\n' +
                                         'with following data: ' + input.toString());
            }
            results.push(beforeInvoke(call, name, args, byref, context));
        } while (tag === Tags.TagCall);
        return Future.reduce(results, function(output, result) {
            output.write(result.bytes);
            return output;
        }, new BytesIO()).then(function(output) {
            output.writeByte(Tags.TagEnd);
            return outputFilter(output.bytes, context);
        });
    }

    function doFunctionList(context) {
        var stream = new BytesIO();
        var writer = new Writer(stream, true);
        stream.writeByte(Tags.TagFunctions);
        writer.writeList(_names);
        stream.writeByte(Tags.TagEnd);
        return outputFilter(stream.bytes, context);
    }

    function defaultHandle(request, context) {
        try {
            var input = new BytesIO(inputFilter(request, context));
            switch (input.readByte()) {
                case Tags.TagCall: return doInvoke(input, context);
                case Tags.TagEnd: return doFunctionList(context);
                default: throw new Error('Wrong Request: \r\n' + BytesIO.toString(request));
            }
        }
        catch (e) {
            return endError(e, context);
        }
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

    function addFunction(func, alias, mode, simple, useHarmonyMap, async, passContext) {
        if (typeof(func) !== 'function') {
            throw new Error('Argument func must be a function');
        }
        if (mode === undefined) {
            mode = ResultMode.Normal;
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
                thisArg: null,
                mode: mode,
                useHarmonyMap: !!useHarmonyMap,
                simple: simple,
                async: !!async,
                passContext: passContext
            };
        }
        else {
            throw new Error('Argument alias must be a string');
        }
    }

    function addAsyncFunction(func, alias, mode, simple, useHarmonyMap, passContext) {
        addFunction(func, alias, mode, simple, useHarmonyMap, true, passContext);
    }

    function addMissingFunction(func, mode, simple, useHarmonyMap, async, passContext) {
        addFunction(func, '*', mode, simple, useHarmonyMap, async, passContext);
    }

    function addAsyncMissingFunction(func, mode, simple, useHarmonyMap, passContext) {
        addMissingFunction(func, mode, simple, useHarmonyMap, true, passContext);
    }

    function addFunctions(funcs, aliases, mode, simple, useHarmonyMap, async, passContext) {
        var i;
        if (aliases === undefined || aliases === null || aliases === '') {
            for (i in funcs) {
                addFunction(funcs[i], null, mode, simple, useHarmonyMap, async, passContext);
            }
        }
        else {
            if (funcs.length !== aliases.length) {
                throw new Error('The count of functions is not matched with aliases');
            }
            for (i in funcs) {
                addFunction(funcs[i], aliases[i], mode, simple, useHarmonyMap, async, passContext);
            }
        }
    }

    function addAsyncFunctions(funcs, aliases, mode, simple, useHarmonyMap, passContext) {
        addFunctions(funcs, aliases, mode, simple, useHarmonyMap, true, passContext);
    }

    function addMethod(method, obj, alias, thisArg, mode, simple, useHarmonyMap, async, passContext) {
        if (obj === undefined || obj === null) {
            addFunction(method, alias, mode, simple, useHarmonyMap, async, passContext);
            return;
        }
        if (typeof(method) !== 'function' &&
            typeof(obj[method]) !== 'function') {
                throw new Error('method or obj[method] must be a function');
        }
        if (thisArg === undefined) {
            thisArg = obj;
        }
        if (mode === undefined) {
            mode = ResultMode.Normal;
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
                func: method,
                thisArg: thisArg,
                mode: mode,
                simple: simple,
                useHarmonyMap: useHarmonyMap,
                async: !!async,
                passContext: passContext
            };
        }
        else {
            throw new Error('Argument alias must be a string');
        }
    }

    function addAsyncMethod(method, obj, alias, thisArg, mode, simple, useHarmonyMap, passContext) {
        addMethod(method, obj, alias, thisArg, mode, simple, useHarmonyMap, true, passContext);
    }

    function addMissingMethod(method, obj, thisArg, mode, simple, useHarmonyMap, async, passContext) {
        addMethod(method, obj, '*', thisArg, mode, simple, useHarmonyMap, async, passContext);
    }

    function addAsyncMissingMethod(method, obj, thisArg, mode, simple, useHarmonyMap, passContext) {
        addMissingMethod(method, obj, thisArg, mode, simple, useHarmonyMap, true, passContext);
    }

    function addMethods(methods, obj, aliases, thisArg, mode, simple, useHarmonyMap, async, passContext) {
        var i;
        if (aliases === undefined || aliases === null || aliases === '') {
            for (i in methods) {
                addMethod(methods[i], obj, null, thisArg, mode, simple, useHarmonyMap, async, passContext);
            }
        }
        else {
            if (methods.length !== aliases.length) {
                throw new Error('The count of methods is not matched with aliases');
            }
            for (i in methods) {
                addMethod(methods[i], obj, aliases[i], thisArg, mode, simple, useHarmonyMap, async, passContext);
            }
        }
    }

    function addAsyncMethods(methods, obj, aliases, thisArg, mode, simple, useHarmonyMap, passContext) {
        addMethods(methods, obj, aliases, thisArg, mode, simple, useHarmonyMap, true, passContext);
    }

    function addInstanceMethods(obj, aliasPrefix, thisArg, mode, simple, useHarmonyMap, async, passContext) {
        var alias;
        for (var name in obj) {
            alias = (aliasPrefix ? aliasPrefix + '_' + name : name);
            if (typeof(obj[name]) === 'function') {
                addMethod(obj[name], obj, alias, thisArg, mode, simple, useHarmonyMap, async, passContext);
            }
        }
    }

    function addAsyncInstanceMethods(obj, aliasPrefix, thisArg, mode, simple, useHarmonyMap, passContext) {
        addInstanceMethods(obj, aliasPrefix, thisArg, mode, simple, useHarmonyMap, true, passContext);
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

    addFunction(getNextId, '#', ResultMode.Normal, true);

    Object.defineProperties(this, {
        doFunctionList: { value: doFunctionList },
        defaultHandle: { value: defaultHandle },
        onBeforeInvoke: { get: getBeforeInvoke, set: setBeforeInvoke },
        onAfterInvoke: { get: getAfterInvoke, set: setAfterInvoke },
        onSendError: { get: getSendError, set: setSendError },
        timeout: { get: getTimeout, set: setTimeout },
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
        addAsync: { value: addAsync }
    });
}

util.inherits(Service, EventEmitter);

global.hprose.Service = Service;
