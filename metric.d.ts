import { Request, Response } from "express";
import client from "prom-client";
import { AppConfig } from "./env";
export declare class OctonetMetrics {
    private histogram;
    readonly register: client.Registry;
    constructor(config: AppConfig);
    /**
     * HTTP Handler for sending prometheus metrics
     * @param req Express Request object
     * @param res Express response object
     */
    send(req: Request, res: Response): void;
    /**
     * Records a HTTP response
     * @param req Express request object
     * @param res Express response object
     */
    record(req: Request, res: Response): void;
}
