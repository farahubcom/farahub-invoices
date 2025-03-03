const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");

const { Schema } = mongoose;
const { ObjectId } = mongoose.Types;


const InvoiceSchema = new Schema({
    number: { type: Number, required: true },
    label: { type: ObjectId, ref: 'Meta' },
    client: { type: ObjectId, refPath: 'clientModel', required: true, },
    clientModel: { type: String, required: true },
    note: String,
    factors: [{
        title: String,
        type: { type: String, enum: ['enhancer', 'reducer'], required: true },
        amount: { type: Number, required: true },
        unit: { type: String, enum: ['percent', 'price'], required: true }
    }],
    validTill: Date,
    // denormalized fields
    // total: Number
}, {

    /**
     * Name of the collection
     * 
     * @var string
     */
    collection: "invoices:invoices",
    
    /**
     * Enable collection timestamps
     * 
     * @var bool
     */
    timestamps: true, 
});

InvoiceSchema.virtual('items', {
    ref: 'InvoiceItem',
    localField: '_id',
    foreignField: 'invoice'
});

InvoiceSchema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
});

InvoiceSchema.plugin(mongooseLeanVirtuals);

module.exports = InvoiceSchema;