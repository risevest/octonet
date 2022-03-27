const client = require("prom-client")

export const octonetMetrics = () => {
    const register = new client.Registry()

    const histogram = new client.Histogram({
        name: "http_request_response_time",
        help: "Response time of HTTP requests",
        labelNames: ["method", "statusCode", "path"]
    })

    register.registerMetric(histogram)

    register.setDefaultLabels({
        app: "octonet"
    })

    client.collectDefaultMetrics({register})

    (function send(req, res){
        res.setHeader("Content-Type", register.contentType);
        res.send(register.metrics());
    }())

    (function record(req, res){
        const responseTimeHeader = res.getHeader("X-Response-Time");
        const time = parseFloat(responseTimeHeader) / 1000;
        const url = `${req.baseUrl}${req.route.path}`;
        histogram.labels(req.method, String(res.statusCode), url).observe(time);
    }())
    
}

    