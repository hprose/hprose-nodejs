/*jshint node:true */
"use strict";

var hprose = require('../lib/hprose.js');
console.log(hprose.unserialize(hprose.serialize(0)));
console.log(hprose.unserialize(hprose.serialize(1)));
console.log(hprose.unserialize(hprose.serialize(9)));
console.log(hprose.unserialize(hprose.serialize(10)));
console.log(hprose.unserialize(hprose.serialize(-1)));
console.log(hprose.unserialize(hprose.serialize(100000)));
console.log(hprose.unserialize(hprose.serialize(12345678909876)));
console.log(hprose.unserialize(hprose.serialize(Math.PI)));
console.log(hprose.unserialize(hprose.serialize(new Date())));
console.log(hprose.serialize("Hello World!").toString());
console.log(hprose.serialize("你好中国!").toString());
console.log(hprose.unserialize(hprose.serialize("Hello World!")));
console.log(hprose.unserialize(hprose.serialize("你好中国!")));
console.log(hprose.unserialize(hprose.serialize(new Buffer("你好"))).toString());
console.log(hprose.unserialize(new Buffer("l1234567890987654321234567890;")));
console.log(hprose.unserialize(hprose.serialize(NaN)));
console.log(hprose.serialize(NaN).toString());
console.log(hprose.serialize(Infinity).toString());
console.log(hprose.serialize(-Infinity).toString());
console.log(hprose.serialize(true).toString());
console.log(hprose.serialize(false).toString());
console.log(hprose.serialize(undefined).toString());
console.log(hprose.serialize(null).toString());
console.log(hprose.serialize("").toString());
console.log(hprose.serialize(new Buffer(0)).toString());
console.log(hprose.serialize([3,3,4,5]).toString());

var s = hprose.serialize({"name": "MaBingyao", "alias": "MaBingyao", "age": 32, "sex": "male"});
console.log(s.toString());
console.log(hprose.unserialize(s));
function User(name, age) {
    this.name = name;
    this.age = age;
}
hprose.register(User, "MyUser");
var user1 = new User("张三", 32);
var user2 = new User("李四", 28);
s = hprose.serialize([user1, user2, user1, user2]);
console.log(s.toString());
console.log(hprose.unserialize(s));
var arr = ["name", "sex", "sex"];
s = hprose.serialize(arr);
console.log(s.toString());
console.log(hprose.unserialize(s));

// Test HarmonyMaps
var map = new global.Map();
map.set(map, map);
map.set(NaN, "NaN");
map.set(-0, "-0");
console.log(map.size);
s = hprose.serialize(map);
console.log(s.toString());
console.log(hprose.unserialize(s, false, true).size);
