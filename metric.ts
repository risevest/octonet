import { Request, Response } from "express";
import client, { Histogram, Registry } from "prom-client";
import { AppConfig } from "./env";

export class WebMetrics {
    private histogram: Histogram<string>;
    public register: Registry;
    
    constructor(config: AppConfig) {
        this.register = new Registry()
        this.histogram = new Histogram({
            name: "http_request_response_time",
            help: "Response time of HTTP requests",
            labelNames: ["method", "statusCode", "path"]
        })
        this.register.registerMetric(this.histogram)
        this.register.setDefaultLabels({
            app: config.app_name
        })
        client.collectDefaultMetrics({register: this.register})
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

