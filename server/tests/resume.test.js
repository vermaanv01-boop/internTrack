const { after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interntrack-resumes-"));

process.env.JWT_SECRET = "test-jwt-secret-for-resume-tests";
process.env.RESUME_UPLOAD_DIR = tempDir;

const Resume = require("../models/resumeModel");
const resumeRoutes = require("../routes/resumeRoutes");
const { MAX_FILE_SIZE } = require("../utils/resumeContent");

const app = express();
app.use(express.json());
app.use("/api/resumes", resumeRoutes);
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({ message: "Server error" });
});

const ownerId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();

const methodNames = [
    "find",
    "findOne",
    "exists",
    "create",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
];
const originalMethods = {};

for (const methodName of methodNames) {
    originalMethods[methodName] = Resume[methodName];
}

let store = [];

const matches = (document, filter) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "$ne")) {
        return String(document[key]) !== String(value.$ne);
    }

    return String(document[key]) === String(value);
});

const installMockModel = () => {
    Resume.find = (filter) => ({
        sort: (sortSpec) => {
            const documents = store.filter((document) => matches(document, filter));
            const direction = sortSpec && sortSpec.createdAt === 1 ? 1 : -1;

            return Promise.resolve(documents.sort((left, right) => (
                (left.createdAt.getTime() - right.createdAt.getTime()) * direction
            )));
        },
    });

    Resume.findOne = async (filter) => store.find((document) => matches(document, filter)) || null;

    Resume.exists = async (filter) => (
        store.some((document) => matches(document, filter)) ? { _id: "exists" } : null
    );

    Resume.create = async (data) => {
        const now = new Date();
        const document = {
            _id: new mongoose.Types.ObjectId(),
            extractedText: "",
            isActive: false,
            ...data,
            createdAt: now,
            updatedAt: now,
        };

        store.push(document);
        return document;
    };

    Resume.updateMany = async (filter, update) => {
        let modifiedCount = 0;

        for (const document of store) {
            if (matches(document, filter)) {
                Object.assign(document, update.$set);
                document.updatedAt = new Date();
                modifiedCount += 1;
            }
        }

        return { modifiedCount };
    };

    Resume.findOneAndUpdate = async (filter, update) => {
        const document = store.find((candidate) => matches(candidate, filter));

        if (!document) {
            return null;
        }

        Object.assign(document, update.$set);
        document.updatedAt = new Date();
        return document;
    };

    Resume.deleteOne = async (filter) => {
        const previousLength = store.length;
        store = store.filter((document) => !matches(document, filter));
        return { deletedCount: previousLength - store.length };
    };
};

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1h" });

const asUser = (requestBuilder, id = ownerId) => (
    requestBuilder.set("Authorization", `Bearer ${tokenFor(id)}`)
);

const makePdf = (text = "Hello Resume") => new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "LETTER" });
    const chunks = [];

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(18).text(text);
    document.end();
});

const escapeXml = (value) => value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
}[character]));

const makeDocx = async (text = "John Doe Resume") => {
    const zip = new JSZip();

    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body></w:document>`);

    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};

const uploadPdf = async (text = "Hello Resume", filename = "resume.pdf", id = ownerId) => {
    const pdf = await makePdf(text);

    return asUser(request(app)
        .post("/api/resumes")
        .attach("resume", pdf, { filename, contentType: "application/pdf" }), id);
};

const cleartempDir = () => {
    for (const entry of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
};

beforeEach(() => {
    store = [];
    cleartempDir();
    installMockModel();
});

after(() => {
    for (const methodName of methodNames) {
        Resume[methodName] = originalMethods[methodName];
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
});

test("uploads a PDF, validates its content, extracts text, and stores it outside the response", async () => {
    const pdf = await makePdf("Hello Resume");
    const response = await uploadPdf("Hello Resume", "My Resume.PDF");

    assert.equal(response.status, 201);
    assert.equal(response.body.resume.isActive, true);
    assert.equal(response.body.resume.originalName, "My Resume.PDF");
    assert.equal(response.body.resume.mimeType, "application/pdf");
    assert.equal(response.body.resume.hasExtractedText, true);
    assert.ok(response.body.resume.textLength > 0);
    assert.equal(response.body.resume.storedFilename, undefined);
    assert.equal(response.body.resume.extractedText, undefined);
    assert.equal(JSON.stringify(response.body).includes(tempDir), false);

    assert.equal(store.length, 1);
    assert.match(store[0].storedFilename, /^[0-9a-f-]{36}\.pdf$/i);
    assert.match(store[0].extractedText, /Hello Resume/);

    const storedPath = path.join(tempDir, store[0].storedFilename);
    assert.equal(fs.existsSync(storedPath), true);
    assert.equal(fs.statSync(storedPath).size, pdf.length);
});

test("uploads a DOCX, validates its content, and extracts text", async () => {
    const docx = await makeDocx("John Doe Resume");
    const response = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", docx, {
            filename: "resume.docx",
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }));

    assert.equal(response.status, 201);
    assert.equal(response.body.resume.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(response.body.resume.isActive, true);
    assert.match(store[0].extractedText, /John Doe Resume/);
    assert.match(store[0].storedFilename, /^[0-9a-f-]{36}\.docx$/i);
    assert.equal(fs.existsSync(path.join(tempDir, store[0].storedFilename)), true);
});

test("accepts a valid document with no extractable text", async () => {
    const docx = await makeDocx("");
    const response = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", docx, { filename: "empty.docx" }));

    assert.equal(response.status, 201);
    assert.equal(response.body.resume.hasExtractedText, false);
    assert.equal(response.body.resume.textLength, 0);
    assert.equal(store[0].extractedText, "");
});

test("rejects unsupported file types", async () => {
    const response = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", Buffer.from("plain text, not a resume"), {
            filename: "resume.txt",
            contentType: "text/plain",
        }));

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Unsupported file type/);
    assert.equal(store.length, 0);
    assert.equal(fs.readdirSync(tempDir).length, 0);
});

test("rejects files larger than 5 MB", async () => {
    const response = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", Buffer.alloc(MAX_FILE_SIZE + 1, 0x41), {
            filename: "resume.pdf",
            contentType: "application/pdf",
        }));

    assert.equal(response.status, 413);
    assert.match(response.body.message, /Maximum size is 5 MB/);
    assert.equal(store.length, 0);
    assert.equal(fs.readdirSync(tempDir).length, 0);
});

test("rejects corrupted and disguised documents", async () => {
    const corruptedPdf = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", Buffer.from("%PDF-1.4\nthis is not a real pdf"), {
            filename: "resume.pdf",
            contentType: "application/pdf",
        }));

    assert.equal(corruptedPdf.status, 400);
    assert.match(corruptedPdf.body.message, /Invalid or corrupted PDF/);

    const disguisedExecutable = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", Buffer.from("MZ\u0090\u0000executable content"), {
            filename: "resume.pdf",
            contentType: "application/pdf",
        }));

    assert.equal(disguisedExecutable.status, 400);

    const extensionMismatch = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", await makePdf(), {
            filename: "resume.docx",
            contentType: "application/pdf",
        }));

    assert.equal(extensionMismatch.status, 400);
    assert.match(extensionMismatch.body.message, /does not match/);

    const corruptedDocx = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            Buffer.from("[Content_Types].xml word/document.xml not a real zip"),
        ]), {
            filename: "resume.docx",
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }));

    assert.equal(corruptedDocx.status, 400);
    assert.match(corruptedDocx.body.message, /Invalid or corrupted DOCX/);
    assert.equal(store.length, 0);
    assert.equal(fs.readdirSync(tempDir).length, 0);
});

test("cleans up a written file when database persistence fails", async () => {
    Resume.create = async () => {
        throw new Error("Simulated database failure");
    };

    const response = await uploadPdf("Cleanup Resume", "cleanup.pdf");

    assert.equal(response.status, 500);
    assert.equal(store.length, 0);
    assert.equal(fs.readdirSync(tempDir).length, 0);
});

test("supports multiple resume versions with only one active", async () => {
    const first = await uploadPdf("First Resume", "first.pdf");
    const second = await uploadPdf("Second Resume", "second.pdf");

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.resume.isActive, true);
    assert.equal(second.body.resume.isActive, false);
    assert.equal(store.length, 2);

    const listResponse = await asUser(request(app).get("/api/resumes"));
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.resumes.length, 2);
    assert.equal(listResponse.body.resumes.filter((resume) => resume.isActive).length, 1);
    assert.equal(JSON.stringify(listResponse.body).includes("extractedText"), false);
    assert.equal(JSON.stringify(listResponse.body).includes("storedFilename"), false);

    const detailResponse = await asUser(request(app).get(`/api/resumes/${first.body.resume._id}`));
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.resume.extractedText, undefined);
    assert.equal(detailResponse.body.resume.storedFilename, undefined);
});

test("switches the active resume", async () => {
    const first = await uploadPdf("First Resume", "first.pdf");
    const second = await uploadPdf("Second Resume", "second.pdf");

    const activateResponse = await asUser(
        request(app).patch(`/api/resumes/${second.body.resume._id}/activate`),
    );

    assert.equal(activateResponse.status, 200);
    assert.equal(activateResponse.body.resume.isActive, true);
    assert.equal(store.filter((resume) => resume.isActive).length, 1);
    assert.equal(String(store.find((resume) => resume.isActive)._id), second.body.resume._id);
    assert.equal(String(store.find((resume) => String(resume._id) === first.body.resume._id).isActive), "false");

    const repeatResponse = await asUser(
        request(app).patch(`/api/resumes/${second.body.resume._id}/activate`),
    );

    assert.equal(repeatResponse.status, 200);
    assert.match(repeatResponse.body.message, /already active/);
});

test("downloads the resume securely without exposing storage paths", async () => {
    const pdf = await makePdf("Downloadable Resume");
    const uploadResponse = await asUser(request(app)
        .post("/api/resumes")
        .attach("resume", pdf, { filename: "download.pdf", contentType: "application/pdf" }));
    const resumeId = uploadResponse.body.resume._id;

    const response = await asUser(request(app).get(`/api/resumes/${resumeId}/download`))
        .buffer(true)
        .parse((res, callback) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => callback(null, Buffer.concat(chunks)));
        });

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.match(response.headers["content-disposition"], /^attachment;/);
    assert.match(response.headers["content-disposition"], /filename="download\.pdf"/);
    assert.equal(Buffer.compare(response.body, pdf), 0);
    assert.equal(JSON.stringify(response.headers).includes(tempDir), false);
});

test("rejects cross-user access with 404 for every operation", async () => {
    const uploadResponse = await uploadPdf("Private Resume", "private.pdf");
    const resumeId = uploadResponse.body.resume._id;
    const storedPath = path.join(tempDir, store[0].storedFilename);

    const listResponse = await asUser(request(app).get("/api/resumes"), otherUserId);
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.resumes.length, 0);

    const detailResponse = await asUser(
        request(app).get(`/api/resumes/${resumeId}`),
        otherUserId,
    );
    assert.equal(detailResponse.status, 404);

    const downloadResponse = await asUser(
        request(app).get(`/api/resumes/${resumeId}/download`),
        otherUserId,
    );
    assert.equal(downloadResponse.status, 404);

    const activateResponse = await asUser(
        request(app).patch(`/api/resumes/${resumeId}/activate`),
        otherUserId,
    );
    assert.equal(activateResponse.status, 404);

    const deleteResponse = await asUser(
        request(app).delete(`/api/resumes/${resumeId}`),
        otherUserId,
    );
    assert.equal(deleteResponse.status, 404);

    assert.equal(store.length, 1);
    assert.equal(fs.existsSync(storedPath), true);
});

test("deletes the resume record and its stored file", async () => {
    const uploadResponse = await uploadPdf("Delete Me", "delete-me.pdf");
    const resumeId = uploadResponse.body.resume._id;
    const storedPath = path.join(tempDir, store[0].storedFilename);

    assert.equal(fs.existsSync(storedPath), true);

    const response = await asUser(request(app).delete(`/api/resumes/${resumeId}`));

    assert.equal(response.status, 200);
    assert.equal(store.length, 0);
    assert.equal(fs.existsSync(storedPath), false);

    const secondDelete = await asUser(request(app).delete(`/api/resumes/${resumeId}`));
    assert.equal(secondDelete.status, 404);
});

test("prevents path traversal through a tampered stored filename", async () => {
    const resumeId = new mongoose.Types.ObjectId();
    const now = new Date();

    store.push({
        _id: resumeId,
        user: ownerId,
        originalName: "tampered.pdf",
        storedFilename: "../../../etc/passwd",
        mimeType: "application/pdf",
        fileSize: 10,
        extractedText: "secret",
        isActive: false,
        createdAt: now,
        updatedAt: now,
    });

    const response = await asUser(request(app).get(`/api/resumes/${resumeId}/download`));

    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Resume file not found");
});

test("requires authentication for every resume endpoint", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const pdf = await makePdf();

    const responses = await Promise.all([
        request(app).post("/api/resumes").attach("resume", pdf, { filename: "resume.pdf" }),
        request(app).get("/api/resumes"),
        request(app).get(`/api/resumes/${id}`),
        request(app).get(`/api/resumes/${id}/download`),
        request(app).patch(`/api/resumes/${id}/activate`),
        request(app).delete(`/api/resumes/${id}`),
    ]);

    for (const response of responses) {
        assert.equal(response.status, 401);
    }
});
