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
 * LastModified: Feb 25, 2016                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*global global */
/*jshint node:true, noused:true, eqeqeq:true */
(function() {
    'use strict';

    if (global.setImmediate) return;

    var slice = Function.prototype.call.bind(Array.prototype.slice);
    var nextId = 1;
    var tasks = {};

    function wrap(handler) {
        var args = slice(arguments, 1);
        return function() {
            handler.apply(undefined, args);
        };
    }

    function run(handleId) {
        var task = tasks[handleId];
        if (task) {
            try {
                task();
            }
            finally {
                clear(handleId);
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
})();
