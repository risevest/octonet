import { Request, Response } from "express";
import client from "prom-client";

export class octonetMetrics {
    private histogram: any;
    register: any;

    constructor() {

        this.register = new client.Registry()

        this.histogram = new client.Histogram({
            name: "http_request_response_time",
            help: "Response time of HTTP requests",
            labelNames: ["method", "statusCode", "path"]
        })

        this.register.registerMetric(this.histogram)

        this.register.setDefaultLabels({
            app: "octonet"
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
        const responseTimeHeader: any = res.getHeader("X-Response-Time");
        const time: number = parseFloat(responseTimeHeader) / 1000;
        const url: string = `${req.baseUrl}${req.route.path}`;
        this.histogram
            .labels(req.method, String(res.statusCode), url)
            .observe(time);
    }
}

