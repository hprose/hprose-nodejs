module.exports = function(batches, context, next) {
    console.log("before invoke:", batches);
    var result = next(batches, context);
    console.log("after invoke:", batches, result);
    return result;
};
