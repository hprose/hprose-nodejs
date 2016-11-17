var thunkify = require('../lib/hprose.js').thunkify;

var delay = thunkify(function (time, callback) {
  setTimeout(callback, time);
});

var result = delay(100);
setTimeout(function () {
  console.log('a');
  result(function () {
    console.log('c');
  });
  console.log('b');
}, 500);