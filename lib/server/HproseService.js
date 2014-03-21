/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.net/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * HproseService.js                                       *
 *                                                        *
 * HproseService for Node.js.                             *
 *                                                        *
 * LastModified: Mar 21, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var HproseResultMode = require('../common/HproseResultMode.js');
var HproseException = require('../common/HproseException.js');
var HproseTags = require('../io/HproseTags.js');
var HproseBufferInputStream = require('../io/HproseBufferInputStream.js');
var HproseBufferOutputStream = require('../io/HproseBufferOutputStream.js');
var HproseReader = require('../io/HproseReader.js');
var HproseWriter = require('../io/HproseWriter.js');

function callService(method, obj, context, args) {
    var result;
    if (typeof(method) === 'function') {
        result = method.apply(context, args);
    }
    else if (obj && typeof(obj[method]) === 'function') {
        result = obj[method].apply(context, args);
    }
    return result;
}

function arrayValues(obj) {
    var result = [];
    for (var key in obj) result.push(obj[key]);
    return result;
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

function responseEnd(ostream, request, response, filters) {
    var data = ostream.toBuffer();
    for (var i = 0, n = filters.length; i < n; i++) {
        data = filters[i].outputFilter(data, request);
    }
    response.emit('end', data);
}

function getCallback(service, functionName, functionArgs, byref, resultMode, async, writer, request, response, filters) {
    return function(result) {
        service.emit('afterInvoke', functionName, functionArgs, byref, result, request);
        var ostream = writer.stream;
        if (resultMode === HproseResultMode.RawWithEndTag) {
            ostream.write(result);
            responseEnd(ostream, request, response, filters);
            return true;
        }
        else if (resultMode === HproseResultMode.Raw) {
            ostream.write(result);
        }
        else {
            ostream.write(HproseTags.TagResult);
            if (resultMode === HproseResultMode.Serialized) {
                ostream.write(result);
            }
            else {
                writer.reset();
                writer.serialize(result);
            }
            if (byref) {
                ostream.write(HproseTags.TagArgument);
                writer.reset();
                writer.writeList(functionArgs);
            }
        }
        if (async) {
            ostream.write(HproseTags.TagEnd);
            responseEnd(ostream, request, response, filters);
        }
        return false;
    };
}

function HproseService() {
    var m_functions = {};
    var m_funcNames = {};
    var m_debug = false;
    var m_simple = false;
    var m_filters = [];

    EventEmitter.call(this);

    // private methods
    function doInvoke(service, istream, request, response) {
        var async = false;
        var ostream = new HproseBufferOutputStream();
        var simpleReader = new HproseReader(istream, true);
        var tag;
        do {
            var functionName = simpleReader.readString();
            var aliasName = functionName.toLowerCase();
            var func = m_functions[aliasName] || m_functions['*'];
            var simple, writer;
            if (func) {
                simple = (func.simple === undefined ? m_simple : func.simple);
                writer = new HproseWriter(ostream, simple);
            }
            else {
                throw new HproseException('Can NOT find this function ' + functionName + '().');
            }
            var functionArgs = [];
            var byref = false;
            tag = simpleReader.checkTags([HproseTags.TagList,
                                              HproseTags.TagEnd,
                                              HproseTags.TagCall]);
            if (tag === HproseTags.TagList) {
                var reader = new HproseReader(istream);
                functionArgs = reader.readListWithoutTag();
                tag = reader.checkTags([HproseTags.TagTrue,
                                        HproseTags.TagEnd,
                                        HproseTags.TagCall]);
                if (tag === HproseTags.TagTrue) {
                    byref = true;
                    tag = reader.checkTags([HproseTags.TagEnd,
                                            HproseTags.TagCall]);
                }
            }
            service.emit('beforeInvoke', functionName, functionArgs, byref, request);
            var callback = getCallback(service, functionName, functionArgs, byref, func.resultMode, func.async, writer, request, response, m_filters);
            if (func === m_functions['*']) {
                functionArgs = [functionName, functionArgs];
            }
            if (func.async) {
                async = true;
                callService(func.method, func.obj, func.context, functionArgs.concat([callback]));
            }
            else {
                if (callback(callService(func.method, func.obj, func.context, functionArgs))) return;
            }
        } while (tag === HproseTags.TagCall);
        if (!async) {
            ostream.write(HproseTags.TagEnd);
            responseEnd(ostream, request, response, m_filters);
        }
    }

    // protected methods

    this._doFunctionList = function(request, response) {
        var ostream = new HproseBufferOutputStream();
        var writer = new HproseWriter(ostream, true);
        var functions = arrayValues(m_funcNames);
        ostream.write(HproseTags.TagFunctions);
        writer.writeList(functions);
        ostream.write(HproseTags.TagEnd);
        responseEnd(ostream, request, response, m_filters);
    };

    this._handle = function(data, request, response) {
        for (var i = m_filters.length - 1; i >= 0; i--) {
            data = m_filters[i].inputFilter(data, request);
        }
        var istream = new HproseBufferInputStream(data);
        try {
            switch (istream.getc()) {
                case HproseTags.TagCall: return doInvoke(this, istream, request, response);
                case HproseTags.TagEnd: return this._doFunctionList(request, response);
                default: throw new HproseException('Wrong Request: \r\n' + data.toString());
            }
        }
        catch (e) {
            this.emit('sendError', e, request);
            var ostream = new HproseBufferOutputStream();
            var writer = new HproseWriter(ostream, true);
            ostream.write(HproseTags.TagError);
            writer.writeString(e.message);
            ostream.write(HproseTags.TagEnd);
            responseEnd(ostream, request, response, m_filters);
        }
    };

    // public methods
    this.isDebugEnabled = function() {
        return m_debug;
    };

    this.setDebugEnabled = function(enable) {
        if (enable === undefined) enable = true;
        m_debug = enable;
    };

    this.getSimpleMode = function() {
        return m_simple;
    };

    this.setSimpleMode = function(value) {
        if (value === undefined) value = true;
        m_simple = value;
    };

    this.addMissingFunction = function(func, resultMode, async, simple) {
        this.addFunction(func, '*', resultMode, async, simple);
    };

    this.addAsyncMissingFunction = function(func, resultMode, simple) {
        this.addMissingFunction(func, resultMode, true, simple);
    };

    this.addMissingMethod = function(method, obj, context, resultMode, async, simple) {
        this.addMethod(method, obj, '*', context, resultMode, async, simple);
    };

    this.addAsyncMissingMethod = function(method, obj, context, resultMode, simple) {
        this.addMissingMethod(method, obj, context, resultMode, true, simple);
    };

    this.addFunction = function(func, alias, resultMode, async, simple) {
        if (resultMode === undefined) {
            resultMode = HproseResultMode.Normal;
        }
        if (alias === undefined || alias === null) {
            switch(typeof(func)) {
                case 'string':
                    alias = func;
                    break;
                case 'function':
                    alias = getFuncName(func);
                    if (alias === '') {
                        throw new HproseException('Need an alias');
                    }
                    break;
                default:
                    throw new HproseException('Need an alias');
            }
        }
        if (typeof(alias) === 'string') {
            var aliasName = alias.toLowerCase();
            m_functions[aliasName] = {method: func, obj: null, context: null, resultMode: resultMode, async: async, simple: simple};
            m_funcNames[aliasName] = alias;
        }
        else {
            throw new HproseException('Argument alias is not a string');
        }
    };

    this.addAsyncFunction = function(func, alias, resultMode, simple) {
        this.addFunction(func, alias, resultMode, true, simple);
    };

    this.addFunctions = function(functions, aliases, resultMode, async, simple) {
        var count = functions.length;
        var i;
        if (aliases === undefined || aliases === null) {
            for (i = 0; i < count; i++) this.addFunction(functions[i], null, resultMode, async, simple);
        }
        else {
            if (count !== aliases.length) {
                throw new HproseException('The count of functions is not matched with aliases');
            }
            for (i = 0; i < count; i++) this.addFunction(functions[i], aliases[i], resultMode, async, simple);
        }
    };

    this.addAsyncFunctions = function(functions, aliases, resultMode, simple) {
        this.addFunctions(functions, aliases, resultMode, true, simple);
    };

    this.addMethod = function(method, obj, alias, context, resultMode, async, simple) {
        if (obj === undefined || obj === null) {
            this.addFunction(method, alias, resultMode, async, simple);
            return;
        }
        if (context === undefined) {
            context = obj;
        }
        if (resultMode === undefined) {
            resultMode = HproseResultMode.Normal;
        }
        if (alias === undefined || alias === null) {
            switch(typeof(method)) {
                case 'string':
                    alias = method;
                    break;
                case 'function':
                    alias = getFuncName(method, obj);
                    if (alias === '') {
                        throw new HproseException('Need an alias');
                    }
                    break;
                default:
                    throw new HproseException('Need an alias');
            }
        }
        if (typeof(alias) === 'string') {
            var aliasName = alias.toLowerCase();
            m_functions[aliasName] = {method: method, obj: obj, context: context, resultMode: resultMode, async: async, simple: simple};
            m_funcNames[aliasName] = alias;
        }
        else {
            throw new HproseException('Argument alias is not a string');
        }
    };

    this.addAsyncMethod = function(method, obj, alias, context, resultMode, simple) {
        this.addMethod(method, obj, alias, context, resultMode, true, simple);
    };

    this.addMethods = function(methods, obj, aliases, context, resultMode, async, simple) {
        var count = methods.length;
        var i;
        if (aliases === undefined || aliases === null) {
            for (i = 0; i < count; i++) {
                this.addMethod(methods[i], obj, null, context, resultMode, async, simple);
            }
        }
        else {
            if (count !== aliases.length) {
                throw new HproseException('The count of methods is not matched with aliases');
            }
            for (i = 0; i < count; i++) {
                this.addMethod(methods[i], obj, aliases[i], context, resultMode, async, simple);
            }
        }
    };

    this.addAsyncMethods = function(methods, obj, aliases, context, resultMode, simple) {
        this.addMethods(methods, obj, aliases, context, resultMode, true, simple);
    };

    this.addInstanceMethods = function(obj, aliasPrefix, context, resultMode, async, simple) {
        var alias;
        for (var name in obj) {
            alias = (aliasPrefix ? aliasPrefix + '_' + name : name);
            if (typeof(obj[name]) === 'function') {
                this.addMethod(obj[name], obj, alias, context, resultMode, async, simple);
            }
        }
    };

    this.addAsyncInstanceMethods = function(obj, aliasPrefix, context, resultMode, async, simple) {
        this.addInstanceMethods(obj, aliasPrefix, context, resultMode, true, simple);
    };

    this.getFilter = function () {
        if (m_filters.length === 0) {
            return null;
        }
        return m_filters[0];
    };

    this.setFilter = function (filter) {
        m_filters.length = 0;
        if (filter !== undefined && filter !== null) {
            m_filters.push(filter);
        }
    };

    this.addFilter = function (filter) {
        m_filters.push(filter);
    };

    this.removeFilter = function (filter) {
        var i = m_filters.indexOf(filter);
        if (i === -1) {
            return false;
        }
        m_filters.splice(i, 1);
        return true;
    };
}

util.inherits(HproseService, EventEmitter);

module.exports = HproseService;