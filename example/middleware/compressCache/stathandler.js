module.exports = function(message) {
    return function*(request, context, next) {
        var start = Date.now();
        var response = yield next(request, context);
        var end = Date.now();
        console.log(message + ': It takes ' + (end - start) + ' ms.');
        return response;
    };
};
