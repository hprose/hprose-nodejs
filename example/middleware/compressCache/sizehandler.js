var hprose = require('hprose');
module.exports = function(message) {
    return function*(request, context, next) {
        console.log(message + ' request size: ' + request.length);
        var response = yield next(request, context);
        console.log(message + ' response size: ' + response.length);
        return response;
    };
};
