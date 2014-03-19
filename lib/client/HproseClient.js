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
 * HproseClient.js                                        *
 *                                                        *
 * HproseClient for Node.js.                              *
 *                                                        *
 * LastModified: Mar 18, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*global Proxy */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var HproseResultMode = require('../common/HproseResultMode.js');
var HproseException = require('../common/HproseException.js');
var HproseFilter = require('../common/HproseFilter.js');
var HproseBufferInputStream = require('../io/HproseBufferInputStream.js');
var HproseBufferOutputStream = require('../io/HproseBufferOutputStream.js');
var HproseReader = require('../io/HproseReader.js');
var HproseWriter = require('../io/HproseWriter.js');
var HproseTags = require('../io/HproseTags.js');

function HproseProxy(stub, invoke, ns) {
    this.get = function(proxy, name) {
        if (ns) name = ns + '_' + name;
        return Proxy.createFunction(
            new HproseProxy(stub, invoke, name),
            function () {
                var args = Array.prototype.slice.call(arguments);
                return invoke(stub, name, args);
            }
        );
    };
}

function HproseClient() {
    EventEmitter.call(this);
    var self = this;
    var m_byref = false;
    var m_simple = false;
    var m_timeout = 30000;
    var m_proxy;
    var m_filter = new HproseFilter();
    if (typeof(Proxy) !== 'undefined') m_proxy = Proxy.create(new HproseProxy(this, invoke));

    function invoke(stub, func, args) {
        var resultMode = HproseResultMode.Normal;
        var byref = m_byref;
        var simple = m_simple;
        var lowerCaseFunc = func.toLowerCase();
        var errorHandler = stub[func + '_OnError'] ||
                           stub[func + '_onError'] ||
                           stub[func + '_onerror'] ||
                           stub[lowerCaseFunc + '_OnError'] ||
                           stub[lowerCaseFunc + '_onError'] ||
                           stub[lowerCaseFunc + '_onerror'] ||
                           self[func + '_OnError'] ||
                           self[func + '_onError'] ||
                           self[func + '_onerror'] ||
                           self[lowerCaseFunc + '_OnError'] ||
                           self[lowerCaseFunc + '_onError'] ||
                           self[lowerCaseFunc + '_onerror'];
        var callback = stub[func + '_Callback'] ||
                       stub[func + '_callback'] ||
                       stub[func + '_OnSuccess'] ||
                       stub[func + '_onSuccess'] ||
                       stub[func + '_onsuccess'] ||
                       stub[lowerCaseFunc + '_Callback'] ||
                       stub[lowerCaseFunc + '_callback'] ||
                       stub[lowerCaseFunc + '_OnSuccess'] ||
                       stub[lowerCaseFunc + '_onSuccess'] ||
                       stub[lowerCaseFunc + '_onsuccess'] ||
                       self[func + '_Callback'] ||
                       self[func + '_callback'] ||
                       self[func + '_OnSuccess'] ||
                       self[func + '_onSuccess'] ||
                       self[func + '_onsuccess'] ||
                       self[lowerCaseFunc + '_Callback'] ||
                       self[lowerCaseFunc + '_callback'] ||
                       self[lowerCaseFunc + '_OnSuccess'] ||
                       self[lowerCaseFunc + '_onSuccess'] ||
                       self[lowerCaseFunc + '_onsuccess'];
        var count = args.length;
        if (typeof(args[count - 1]) === 'boolean' &&
            typeof(args[count - 2]) === 'number' &&
            typeof(args[count - 3]) === 'boolean' &&
            typeof(args[count - 4]) === 'function' &&
            typeof(args[count - 5]) === 'function') {
            simple = args[count - 1];
            resultMode = args[count - 2];
            byref = args[count - 3];
            errorHandler = args[count - 4];
            callback = args[count - 5];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            delete args[count - 4];
            delete args[count - 5];
            args.length -= 5;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'number' &&
                 typeof(args[count - 3]) === 'function' &&
                 typeof(args[count - 4]) === 'function') {
            simple = args[count - 1];
            resultMode = args[count - 2];
            errorHandler = args[count - 3];
            callback = args[count - 4];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            delete args[count - 4];
            args.length -= 4;
        }
        else if (typeof(args[count - 1]) === 'number' &&
            typeof(args[count - 2]) === 'boolean' &&
            typeof(args[count - 3]) === 'function' &&
            typeof(args[count - 4]) === 'function') {
            resultMode = args[count - 1];
            byref = args[count - 2];
            errorHandler = args[count - 3];
            callback = args[count - 4];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            delete args[count - 4];
            args.length -= 4;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'boolean' &&
                 typeof(args[count - 3]) === 'function' &&
                 typeof(args[count - 4]) === 'function') {
            simple = args[count - 1];
            byref = args[count - 2];
            errorHandler = args[count - 3];
            callback = args[count - 4];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            delete args[count - 4];
            args.length -= 4;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'function' &&
                 typeof(args[count - 3]) === 'function') {
            byref = args[count - 1];
            errorHandler = args[count - 2];
            callback = args[count - 3];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            args.length -= 3;
        }
        else if (typeof(args[count - 1]) === 'number' &&
                 typeof(args[count - 2]) === 'function' &&
                 typeof(args[count - 3]) === 'function') {
            resultMode = args[count - 1];
            errorHandler = args[count - 2];
            callback = args[count - 3];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            args.length -= 3;
        }
        else if (typeof(args[count - 1]) === 'function' &&
                 typeof(args[count - 2]) === 'function') {
            errorHandler = args[count - 1];
            callback = args[count - 2];
            delete args[count - 1];
            delete args[count - 2];
            args.length -= 2;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'number' &&
                 typeof(args[count - 3]) === 'boolean' &&
                 typeof(args[count - 4]) === 'function') {
            simple = args[count - 1];
            resultMode = args[count - 2];
            byref = args[count - 3];
            callback = args[count - 4];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            delete args[count - 4];
            args.length -= 4;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'number' &&
                 typeof(args[count - 3]) === 'function') {
            simple = args[count - 1];
            resultMode = args[count - 2];
            callback = args[count - 3];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            args.length -= 3;
        }
        else if (typeof(args[count - 1]) === 'number' &&
                 typeof(args[count - 2]) === 'boolean' &&
                 typeof(args[count - 3]) === 'function') {
            resultMode = args[count - 1];
            byref = args[count - 2];
            callback = args[count - 3];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            args.length -= 3;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'boolean' &&
                 typeof(args[count - 3]) === 'function') {
            simple = args[count - 1];
            byref = args[count - 2];
            callback = args[count - 3];
            delete args[count - 1];
            delete args[count - 2];
            delete args[count - 3];
            args.length -= 3;
        }
        else if (typeof(args[count - 1]) === 'boolean' &&
                 typeof(args[count - 2]) === 'function') {
            byref = args[count - 1];
            callback = args[count - 2];
            delete args[count - 1];
            delete args[count - 2];
            args.length -= 2;
        }
        else if (typeof(args[count - 1]) === 'number' &&
                 typeof(args[count - 2]) === 'function') {
            resultMode = args[count - 1];
            callback = args[count - 2];
            delete args[count - 1];
            delete args[count - 2];
            args.length -= 2;
        }
        else if (typeof(args[count - 1]) === 'function') {
            callback = args[count - 1];
            delete args[count - 1];
            args.length--;
        }
        var stream = new HproseBufferOutputStream(HproseTags.TagCall);
        var writer = new HproseWriter(stream, simple);
        writer.writeString(func);
        if (args.length > 0 || byref) {
            writer.reset();
            writer.writeList(args);
            if (byref) {
                writer.writeBoolean(true);
            }
        }
        stream.write(HproseTags.TagEnd);
        var invoker = new EventEmitter();
        invoker.on('getdata', function(data) {
            try {
                var result = getResult(data, func, args, resultMode);
                if (callback) callback(result, args);
            }
            catch (e) {
                invoker.emit('error', e);
            }
        });
        invoker.on('error', function(e) {
            if (errorHandler) {
                errorHandler(func, e);
            }
            else {
                self.emit('error', func, e);
            }
        });
        var data = m_filter.outputFilter(stream.toBuffer(), self);
        stub.emit('senddata', invoker, data);
    }

    function getResult(data, func, args, resultMode) {
        data = m_filter.inputFilter(data, self);
        var result;
        if (resultMode === HproseResultMode.RawWithEndTag) {
            result = data;
        }
        else if (resultMode === HproseResultMode.Raw) {
            result = data.slice(0, data.length - 1);
        }
        else {
            var stream = new HproseBufferInputStream(data);
            var reader = new HproseReader(stream);
            var tag;
            var error;
            while ((tag = stream.getc()) !== HproseTags.TagEnd) {
                switch (tag) {
                case HproseTags.TagResult:
                    if (resultMode === HproseResultMode.Serialized) {
                        result = reader.readRaw().toBuffer();
                    }
                    else {
                        reader.reset();
                        result = reader.unserialize();
                    }
                    break;
                case HproseTags.TagArgument:
                    reader.reset();
                    var a = reader.readList();
                    for (var i = 0; i < a.length; i++) {
                        args[i] = a[i];
                    }
                    break;
                case HproseTags.TagError:
                    reader.reset();
                    error = new HproseException(reader.readString());
                    break;
                default:
                    error = new HproseException('Wrong Response:\r\n' + data.toString());
                    break;
                }
            }
            if (error) throw error;
        }
        return result;
    }

    // public methods
    this.setTimeout = function(value) {
        m_timeout = value;
    };
    this.getTimeout = function() {
        return m_timeout;
    };
    this.invoke = function() {
        var args = arguments;
        var func = Array.prototype.shift.apply(args);
        return invoke(this, func, args);
    };
    this.useService = function() {
        return m_proxy;
    };
    this.getByRef = function() {
        return m_byref;
    };
    this.setByRef = function(value) {
        if (value === undefined) value = true;
        m_byref = value;
    };
    this.getFilter = function() {
        return m_filter;
    };
    this.setFilter = function(filter) {
        m_filter = filter;
    };
    this.getSimpleMode = function() {
        return m_simple;
    };
    this.setSimpleMode = function(value) {
        if (value === undefined) value = true;
        m_simple = value;
    };
}

util.inherits(HproseClient, EventEmitter);

module.exports = HproseClient;