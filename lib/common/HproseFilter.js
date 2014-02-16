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
 * HproseFilter.js                                        *
 *                                                        *
 * HproseFilter for Node.js.                              *
 *                                                        *
 * LastModified: Feb 16, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true */
'use strict';

function HproseFilter() {
    this.inputFilter = function(value) { return value; };
    this.outputFilter = function(value) { return value; };
}

module.exports = HproseFilter;