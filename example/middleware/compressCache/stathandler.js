module.exports = function(message) {
    return function(request, context, next) {
        var start = Date.now();
        var response = next(request, context);
        response.then(function() {
            var end = Date.now();
            console.log(message + ': It takes ' + (end - start) + ' ms.');
        });
        return response;
    };
};
