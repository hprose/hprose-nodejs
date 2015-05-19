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
 * hprose/common/Exception.js                             *
 *                                                        *
 * Hprose Exception for Node.js.                          *
 *                                                        *
 * LastModified: May 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true */
'use strict';

global.hprose.Exception = function Exception(message) {
    this.message = message;
};

global.hprose.Exception.prototype = new Error();
global.hprose.Exception.prototype.name = 'hprose.Exception';
