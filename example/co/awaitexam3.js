(async function() {
    try {
        var a = [];
        for (i = 0; i < 1000000; i++) {
            a[i] = i;
        }
        var start = Date.now();
        await a;
        var end = Date.now();
        console.log(end - start);
    }
    catch (e) {
        console.error(e);
    }
})();

(async function() {
    try {
        var a = [];
        a[0] = a;
        console.log(await a);
    }
    catch (e) {
        console.error(e);
    }
})();

(async function() {
    try {
        var o = {};
        o.self = o;
        console.log(await o);
    }
    catch (e) {
        console.error(e);
    }
})();
