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
 * hprose/io/Tags.js                                      *
 *                                                        *
 * Hprose Tags for Node.js.                               *
 *                                                        *
 * LastModified: May 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true */
'use strict';

global.hprose.Tags = {
    /* Serialize Tags */
    TagInteger     : 0x69, //  'i'
    TagLong        : 0x6C, //  'l'
    TagDouble      : 0x64, //  'd'
    TagNull        : 0x6E, //  'n'
    TagEmpty       : 0x65, //  'e'
    TagTrue        : 0x74, //  't'
    TagFalse       : 0x66, //  'f'
    TagNaN         : 0x4E, //  'N'
    TagInfinity    : 0x49, //  'I'
    TagDate        : 0x44, //  'D'
    TagTime        : 0x54, //  'T'
    TagUTC         : 0x5A, //  'Z'
    TagBytes       : 0x62, //  'b'
    TagUTF8Char    : 0x75, //  'u'
    TagString      : 0x73, //  's'
    TagGuid        : 0x67, //  'g'
    TagList        : 0x61, //  'a'
    TagMap         : 0x6d, //  'm'
    TagClass       : 0x63, //  'c'
    TagObject      : 0x6F, //  'o'
    TagRef         : 0x72, //  'r'
    /* Serialize Marks */
    TagPos         : 0x2B, //  '+'
    TagNeg         : 0x2D, //  '-'
    TagSemicolon   : 0x3B, //  ','
    TagOpenbrace   : 0x7B, //  '{'
    TagClosebrace  : 0x7D, //  '}'
    TagQuote       : 0x22, //  '"'
    TagPoint       : 0x2E, //  '.'
    /* Protocol Tags */
    TagFunctions   : 0x46, //  'F'
    TagCall        : 0x43, //  'C'
    TagResult      : 0x52, //  'R'
    TagArgument    : 0x41, //  'A'
    TagError       : 0x45, //  'E'
    TagEnd         : 0x7A  //  'z'
};
