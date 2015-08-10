module.exports = function(name, args, context, next) {
    console.log("before invoke:", name, args);
    var result = next(name, args, context);
    console.log("after invoke:", name, args, result);
    return result;
};
