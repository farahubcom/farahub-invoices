const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");

const { Schema } = mongoose;
const { ObjectId } = mongoose.Types;


const InvoiceItemSchema = new Schema({
    invoice: { type: ObjectId, ref: 'Invoice', required: true },
    item: { type: ObjectId, refPath: 'itemModel', required: true },
    itemModel: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number },
    discountPercent: { type: Number, min: 0, max: 100 },
    note: String
}, { collection: "invoices:invoice_items" });

InvoiceItemSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
});

InvoiceItemSchema.plugin(mongooseLeanVirtuals);

module.exports = InvoiceItemSchema;