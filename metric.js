"use strict";
exports.__esModule = true;
exports.WebMetrics = void 0;
var prom_client_1 = require("prom-client");
var WebMetrics = /** @class */ (function () {
    function WebMetrics(config) {
        this.register = new prom_client_1["default"].Registry();
        prom_client_1["default"].collectDefaultMetrics({ register: this.register });
        this.histogram = new prom_client_1["default"].Histogram({
            name: "http_request_response_time",
            help: "Response time of HTTP requests",
            labelNames: ["method", "statusCode", "path"],
            registers: [this.register]
        });
        //this.register.registerMetric(this.histogram)
        this.register.setDefaultLabels({
            app: config.app_name
        });
    }
    /**
     * HTTP Handler for sending prometheus metrics
     * @param req Express Request object
     * @param res Express response object
     */
    WebMetrics.prototype.send = function (req, res) {
        res.setHeader("Content-Type", this.register.contentType);
        res.send(this.register.metrics);
    };
    /**
     * Records a HTTP response
     * @param req Express request object
     * @param res Express response object
     */
    WebMetrics.prototype.record = function (req, res) {
        var responseTimeHeader = res.getHeader("X-Response-Time");
        var time = (Math.round((+responseTimeHeader + Number.EPSILON) * 100) / 100) / 1000;
        var url = "".concat(req.baseUrl).concat(req.route.path);
        this.histogram
            .label(req.method, String(res.statusCode), url)
            .observe(time);
    };
    return WebMetrics;
}());
exports.WebMetrics = WebMetrics;
