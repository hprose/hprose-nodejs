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
 * hprose/common/ResultMode.js                            *
 *                                                        *
 * Hprose ResultMode for Node.js.                         *
 *                                                        *
 * LastModified: May 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true */
'use strict';

global.hprose.ResultMode = {
    Normal: 0,
    Serialized: 1,
    Raw: 2,
    RawWithEndTag: 3
};
global.hprose.Normal        = global.hprose.ResultMode.Normal;
global.hprose.Serialized    = global.hprose.ResultMode.Serialized;
global.hprose.Raw           = global.hprose.ResultMode.Raw;
global.hprose.RawWithEndTag = global.hprose.ResultMode.RawWithEndTag;
