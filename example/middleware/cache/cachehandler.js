var cache = {};
module.exports = function(name, args, context, next) {
    if (context.userdata.cache) {
        var key = JSON.stringify(args);
        if (name in cache) {
            if (key in cache[name]) {
                return cache[name][key];
            }
        }
        else {
            cache[name] = {};
        }
        var result = next(name, args, context);
        cache[name][key] = result;
        return result;
    }
    return next(name, args, context);
};
