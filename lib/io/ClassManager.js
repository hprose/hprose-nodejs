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
 * hprose/io/ClassManager.js                              *
 *                                                        *
 * hprose ClassManager for Node.js.                       *
 *                                                        *
 * LastModified: May 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var WeakMap = global.WeakMap;

var classCache = Object.create(null);
var aliasCache = new WeakMap();

function register(cls, alias) {
    aliasCache.set(cls, alias);
    classCache[alias] = cls;
}

function getClassAlias(cls) {
    return aliasCache.get(cls);
}

function getClass(alias) {
    return classCache[alias];
}

global.hprose.ClassManager = Object.create(null, {
    register: { value: register },
    getClassAlias: { value: getClassAlias },
    getClass: { value: getClass }
});

global.hprose.register = register;

register(Object, 'Object');
