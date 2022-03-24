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
        app: "octonet-api"
    })

    client.collectDefaultMetrics({register})

    app.get('/metrics', async(req, res) => {
        res.setHeader('Content-type', register.contentType)
        const responseTimeHeader = res.getHeader("X-Response-Time");
        const time = parseFloat(responseTimeHeader) / 1000;
        const url = `${req.baseUrl}${req.route.path}`;
        histogram.labels(req.method, String(res.statusCode), url).observe(time)
        res.send(await register.metrics())

    })


}

    