var co = require('hprose').co;

co(function*() {
    try {
        var a = [];
        for (i = 0; i < 1000000; i++) {
            a[i] = i;
        }
        var start = Date.now();
        yield a;
        var end = Date.now();
        console.log(end - start);
    }
    catch (e) {
        console.error(e);
    }
});

co(function*() {
    try {
        var a = [];
        a[0] = a;
        console.log(yield a);
    }
    catch (e) {
        console.error(e);
    }
});

co(function*() {
    try {
        var o = {};
        o.self = o;
        console.log(yield o);
    }
    catch (e) {
        console.error(e);
    }
});
