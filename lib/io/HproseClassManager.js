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
 * HproseClassManager.js                                  *
 *                                                        *
 * Hprose ClassManager for Node.js.                       *
 *                                                        *
 * LastModified: Feb 16, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

require('../common/HarmonyMaps.js');

var classCache = Object.create(null);
var aliasCache = new WeakMap();

var HproseClassManager = {
    register: function(cls, alias) {
        aliasCache.set(cls, alias);
        classCache[alias] = cls;
    },
    getClassAlias: function(cls) {
        return aliasCache.get(cls);
    },
    getClass: function(alias) {
        return classCache[alias];
    }
};

HproseClassManager.register(Object, 'Object');

module.exports = HproseClassManager;