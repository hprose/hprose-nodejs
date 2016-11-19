var hprose = require('hprose');

function sum(a, b, callback) {
    callback(a + b);
}

var sum1 = hprose.promisify(sum);
var sum2 = hprose.thunkify(sum);

sum1(1, 2).then(function(result) {
    console.log(result);
});

sum2(2, 3)(function(result) {
    console.log(result);
});

hprose.co(function*() {
    console.log(yield sum1(3, 4));
    console.log(yield sum2(4, 5));
});

(async function() {
    console.log(await sum1(5, 6));
    console.log(await sum2(6, 7));
})();