import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportService } from "../../src/services/export.service.js";
import { exportQueue } from "../../src/jobs/export.job.js";

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock database
const mockInsert = vi.fn().mockResolvedValue([1]);
const mockWhere = vi.fn();
const mockFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(1);
const mockDel = vi.fn().mockResolvedValue(1);
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

const mockDb = vi.fn().mockReturnValue({
    insert: mockInsert,
    where: mockWhere.mockReturnThis(),
    first: mockFirst,
    update: mockUpdate,
    del: mockDel,
    orderBy: mockOrderBy.mockReturnThis(),
    limit: mockLimit,
});

vi.mock("../../src/database/connection.js", () => ({
    getDatabase: () => mockDb,
}));

// Mock config
vi.mock("../../src/config/index.js", () => ({
    config: {
        EXPORT_STORAGE_PATH: "/tmp/exports",
        EXPORT_DOWNLOAD_URL_EXPIRY_HOURS: 24,
        EXPORT_COMPRESSION_THRESHOLD_BYTES: 1048576, // 1MB
        EXPORT_STREAMING_PAGE_SIZE: 1000,
        EXPORT_QUEUE_CONCURRENCY: 5,
        EXPORT_QUEUE_RETRY_ATTEMPTS: 3,
        SMTP_HOST: "smtp.test.com",
        SMTP_PORT: 587,
        SMTP_USER: "test",
        SMTP_PASS: "test",
        SMTP_FROM: "exports@test.com",
    },
}));

const mockExportQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "job-123" }));

// Mock export job queue
vi.mock("../../src/jobs/export.job.js", () => ({
    exportQueue: {
        add: mockExportQueueAdd,
    },
}));

describe("ExportService", () => {
    let exportService: ExportService;

    beforeEach(() => {
        exportService = new ExportService();
        vi.clearAllMocks();
        mockFirst.mockReset();
        mockWhere.mockReset();
        mockWhere.mockReturnThis();
        mockDel.mockReset();
        mockUpdate.mockReset();
        mockInsert.mockReset();
    });

    describe("requestExport", () => {
        const mockExportRequest = {
            format: "csv" as const,
            dataType: "analytics" as const,
            filters: {
                startDate: "2024-01-01",
                endDate: "2024-01-31",
                assetCodes: ["USDC"],
                bridgeIds: ["bridge-1"],
            },
        };

        it("creates export record with pending status", async () => {
            mockInsert.mockResolvedValueOnce([{
                id: "1",
                requested_by: "user-123",
                format: "csv",
                data_type: "analytics",
                status: "pending",
                filters: mockExportRequest.filters,
                created_at: new Date(),
            }]);
            mockFirst.mockResolvedValueOnce({
                id: "1",
                requested_by: "user-123",
                format: "csv",
                data_type: "analytics",
                status: "pending",
                filters: mockExportRequest.filters,
                created_at: new Date(),
            });

            const result = await exportService.requestExport("user-123", mockExportRequest);

            expect(mockInsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    requested_by: "user-123",
                    format: "csv",
                    data_type: "analytics",
                    status: "pending",
                })
            );
            expect(result).toHaveProperty("id");
        });

        it("enqueues export job after creating record", async () => {
            mockInsert.mockResolvedValueOnce([{
                id: "1",
                requested_by: "user-123",
                format: "csv",
                data_type: "analytics",
                status: "pending",
                filters: mockExportRequest.filters,
                created_at: new Date(),
            }]);
            mockFirst.mockResolvedValueOnce({
                id: "1",
                requested_by: "user-123",
                format: "csv",
                data_type: "analytics",
                status: "pending",
            });

            const result = await exportService.requestExport("user-123", mockExportRequest);

            expect(exportQueue.add).toHaveBeenCalledWith(
                "process-export",
                expect.objectContaining({
                    exportId: expect.any(String),
                    format: "csv",
                    dataType: "analytics",
                }),
                expect.any(Object)
            );
            expect(result).toHaveProperty("id");
        });

        it("validates required fields", async () => {
            await expect(
                exportService.requestExport("user-123", {
                    format: "invalid" as any,
                    dataType: "analytics",
                    filters: {
                        startDate: new Date().toISOString(),
                        endDate: new Date().toISOString(),
                    },
                })
            ).rejects.toThrow("Invalid export format");
        });

        it("validates date range", async () => {
            await expect(
                exportService.requestExport("user-123", {
                    format: "csv",
                    dataType: "analytics",
                    filters: {
                        startDate: "2024-01-31",
                        endDate: "2024-01-01", // end before start
                    },
                })
            ).rejects.toThrow("Invalid date range");
        });
    });

    describe("getExportStatus", () => {
        it("returns export record for given ID", async () => {
            const mockRecord = {
                id: "export-123",
                requested_by: "user-123",
                format: "csv",
                data_type: "analytics",
                status: "completed",
                file_path: "/tmp/exports/export-123.csv",
                download_url: "http://example.com/download/export-123",
                created_at: new Date(),
            };

            mockFirst.mockResolvedValueOnce(mockRecord);

            const result = await exportService.getExportStatus("export-123");

            expect(mockWhere).toHaveBeenCalledWith({ id: "export-123" });
            expect(result).toEqual(mockRecord);
        });

        it("returns null for non-existent export", async () => {
            mockFirst.mockResolvedValueOnce(null);

            const result = await exportService.getExportStatus("non-existent");

            expect(result).toBeNull();
        });
    });

    describe("listExports", () => {
        it("returns paginated results for user", async () => {
            const mockRecords = [
                { id: "1", format: "csv", status: "completed" },
                { id: "2", format: "json", status: "pending" },
            ];
            const mockCount = [{ count: "10" }];

            mockOrderBy.mockReturnValueOnce({
                limit: mockLimit.mockResolvedValueOnce(mockRecords),
            });
            mockWhere.mockReturnValueOnce({
                orderBy: mockOrderBy.mockReturnValueOnce({
                    limit: mockLimit.mockResolvedValueOnce(mockCount),
                }),
            });

            mockFirst.mockResolvedValueOnce({ count: "10" });
            mockLimit.mockResolvedValueOnce(mockRecords);

            const result = await exportService.listExports("user-123", { page: 1, limit: 10 });

            expect(result).toHaveLength(2);
            expect(mockWhere).toHaveBeenCalledWith({ requested_by: "user-123" });
        });
    });

    describe("generateDownloadUrl", () => {
        it("generates URL with correct expiry", async () => {
            const mockRecord = {
                id: "export-123",
                status: "completed",
                file_path: "/tmp/exports/export-123.csv",
            };

            mockFirst.mockResolvedValueOnce(mockRecord);
            mockUpdate.mockResolvedValueOnce(1);

            const result = await exportService.generateDownloadUrl("export-123");

            expect(result.url).toContain("token=");
            expect(result.expiresAt).toBeInstanceOf(Date);
            expect(mockUpdate).toHaveBeenCalled();
        });

        it("throws error for non-completed exports", async () => {
            mockFirst.mockResolvedValueOnce({
                id: "export-123",
                status: "pending",
            });

            await expect(
                exportService.generateDownloadUrl("export-123")
            ).rejects.toThrow("Export is not completed");
        });

        it("throws error for non-existent exports", async () => {
            mockFirst.mockResolvedValueOnce(null);

            await expect(
                exportService.generateDownloadUrl("non-existent")
            ).rejects.toThrow("Export not found");
        });
    });

    describe("deleteExport", () => {
        it("deletes database record and file", async () => {
            mockFirst.mockResolvedValueOnce({
                id: "export-123",
                file_path: "/tmp/exports/export-123.csv",
            });
            mockDel.mockResolvedValueOnce(1);

            await expect(
                exportService.deleteExport("export-123")
            ).resolves.not.toThrow();

            expect(mockWhere).toHaveBeenCalledWith({ id: "export-123" });
            expect(mockDel).toHaveBeenCalled();
        });

        it("handles missing file gracefully", async () => {
            mockFirst.mockResolvedValueOnce({
                id: "export-123",
                file_path: "/non/existent/file.csv",
            });
            mockDel.mockResolvedValueOnce(1);

            await expect(
                exportService.deleteExport("export-123")
            ).resolves.not.toThrow();
        });
    });
});
