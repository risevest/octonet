import { Request, Response } from "express";
import { Histogram, Registry, collectDefaultMetrics } from "prom-client";

export class WebMetrics {
    private histogram: Histogram<string>;
    private register: Registry;
    
    constructor(service: string) {
        this.register = new Registry()
        this.histogram = new Histogram({
            name: "http_request_response_time",
            help: "Response time of HTTP requests",
            labelNames: ["method", "statusCode", "path"]
        })
        this.register.registerMetric(this.histogram)
        this.register.setDefaultLabels({
            app: service
        })
        collectDefaultMetrics({register: this.register})
    }
    /**
     * HTTP Handler for sending prometheus metrics
     * @param req Express Request object
     * @param res Express response object
     */
    send(req: Request, res: Response): void {
        res.set("Content-Type", this.register.contentType);
        res.end(this.register.metrics)
    }
    /**
     * Records a HTTP response
     * @param req Express request object
     * @param res Express response object
     */
    record(req: Request, res: Response): void {
        const responseTimeHeader = Number(res.getHeader("X-Response-Time"));
        const time = responseTimeHeader/ 1000;
        const url = `${req.baseUrl}${req.route.path}`;
        this.histogram
            .labels(req.method, String(res.statusCode), url)
            .observe(time);
    }
}

