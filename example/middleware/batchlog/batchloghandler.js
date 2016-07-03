module.exports = function(batches, context, next) {
    console.log("before invoke:", batches);
    var result = next(batches, context);
    result.then(function(result) {
        console.log("after invoke:", batches, result);
    });
    return result;
};
