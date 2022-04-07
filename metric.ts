import { Request, Response } from "express";
import client from "prom-client";
import { AppConfig } from "./env";

export class WebMetrics {
    private histogram;
    register: client.Registry;
    constructor(config: AppConfig) {
        this.register = new client.Registry()
        this.histogram = new client.Histogram({
            name: "http_request_response_time" as string,
            help: "Response time of HTTP requests" as string,
            labelNames: ["method", "statusCode", "path"] as string[]
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
        res.setHeader("Content-Type", this.register.contentType);
        res.send(this.register.metrics)
    }
    /**
     * Records a HTTP response
     * @param req Express request object
     * @param res Express response object
     */
    record(req: Request, res: Response): void {
        const responseTimeHeader: string | number | string[]  = res.getHeader("X-Response-Time");
        const time: number = (Math.round((+responseTimeHeader + Number.EPSILON) * 100) /100)/ 1000;
        const url: string = `${req.baseUrl}${req.route.path}`;
        this.histogram
            .labels(req.method, String(res.statusCode), url)
            .observe(time);
    }
}

