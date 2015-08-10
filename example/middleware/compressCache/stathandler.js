module.exports = function(message) {
    return function(request, context, next) {
        var start = Date.now();
        function showstat() {
            var end = Date.now();
            console.log(message + ': It takes ' + (end - start) + ' ms.');
        }
        var response = next(request, context);
        if (hprose.Future.isPromise(response)) {
            response.then(showstat);
        }
        else {
            showstat();
        }
        return response;
    };
};
