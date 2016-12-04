var hprose = require('hprose');

function normal(p) {
    console.log(p);
    return normal;
}

function* coroutine(p) {
    console.log(yield p);
    return coroutine;
}

// hprose.co(function*() {
//    var p = Promise.resolve(123);
//     console.log(normal(p));
//     console.log(yield coroutine(p));
// })

function* run(fn) {
   var p = Promise.resolve(123);
   console.log(yield hprose.Future.toPromise(fn(p)));
}

hprose.co(function*() {
    yield run(normal);
    yield run(coroutine);
});