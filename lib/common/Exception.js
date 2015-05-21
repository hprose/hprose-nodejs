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
 * LastModified: May 21, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true */
'use strict';

var util = require('util');

function Exception(message) {
    Error.call(this);
    this.message = message;
}

util.inherits(Exception, Error);

Exception.prototype.name = 'hprose.Exception';

global.hprose.Exception = Exception;
