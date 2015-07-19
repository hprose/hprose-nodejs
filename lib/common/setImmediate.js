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
 * hprose/common/setImmediate.js                          *
 *                                                        *
 * setImmediate for Node.js.                              *
 *                                                        *
 * LastModified: Jul 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

if (global.setImmediate) return;

var slice = Function.prototype.call.bind(Array.prototype.slice);
var nextId = 1;
var tasks = {};
var lock = false;

function wrap(handler) {
    var args = slice(arguments, 1);
    return function() {
        handler.apply(undefined, args);
    };
}

function run(handleId) {
    if (lock) {
        global.setTimeout(wrap(run, handleId), 0);
    }
    else {
        var task = tasks[handleId];
        if (task) {
            lock = true;
            try {
                task();
            }
            finally {
                clear(handleId);
                lock = false;
            }
        }
    }
}

function create(args) {
    tasks[nextId] = wrap.apply(undefined, args);
    return nextId++;
}

function clear(handleId) {
    delete tasks[handleId];
}

global.setImmediate = function() {
    var handleId = create(arguments);
    global.process.nextTick( wrap( run, handleId ) );
    return handleId;
};

global.clearImmediate = clear;
