var hprose = require("hprose");
var co = hprose.co;
var thunkify = hprose.thunkify;

var sum = thunkify(function(a, b, callback) {
    console.log("call sum(" + Array.prototype.join.call(arguments) + ")");
    callback(null, a + b);
    callback(null, a + b + a);
});

co(function*() {
    var result = sum(1, 2);
    console.log(yield result);
    console.log(yield sum(2, 3));
    console.log(yield result);
});
