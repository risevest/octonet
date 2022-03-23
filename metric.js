"use strict"
var __importDefault = (this && this.__importDefault) || 
function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "_esModule", { value: true});
const prom_client_1 = __importDefault(require("prom-client"));
class OctonetMetrics {
    constructor(config) {
        this.register = new prom_client_1.default.Registry();
        this.register.setDefaultLabels({
            service: config.service_name,
            environment: config.node_env
        })
        prom_client_1.default.collectDefaultMetrics({ register: this.register});
        this.histogram = new prom_client_1.default.histogram({
            name: "http_request_response_time",
            help: "Response time of HTTP requests in seconds",
            labelNames: ["method", "statusCode", "path"],
            registers: [this.register]
        });
    }
    /**
     * HTTP Handler for sending prometheus metrics
     * @param req Express Request object
     * @param res Express response object
     */
    send(req, res) {
        res.set("Content-Type", this.register.contentType);
        res.end(this.register.metrics());
    }
    /**
     * Records a HTTP response
     * @param req Express request object
     * @param req Express response object
     */
    record(req, res) {
        const responseTimeHeader = res.getHeader("X-Response-Time");
        const time = parseFloat(responseTimeHeader) / 1000;
        const url = `${req.baseUrl}${req.route.path}`;
        this.histogram
            .labels(req.method, String(res.statusCode), url)
            .observe(time)
    }
}
exports.octonetMetrics = OctonetMetrics