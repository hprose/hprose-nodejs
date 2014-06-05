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
 * HproseFilter.js                                        *
 *                                                        *
 * HproseFilter for Node.js.                              *
 *                                                        *
 * LastModified: Mar 18, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, unused:false */
'use strict';

function HproseFilter() {
    this.inputFilter = function(value, context) { return value; };
    this.outputFilter = function(value, context) { return value; };
}

module.exports = HproseFilter;