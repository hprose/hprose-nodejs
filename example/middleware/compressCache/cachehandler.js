var cache = {};
module.exports = function(request, context, next) {
    if (context.userdata.cache) {
        if (request in cache) {
            return cache[request];
        }
        var response = next(request, context);
        cache[request] = response;
        return response;
    }
    return next(request, context);
};
