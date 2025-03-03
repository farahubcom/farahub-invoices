const { Doc } = require('@farahub/framework/facades');
const mongoose = require("mongoose");
const sumBy = require("lodash/sumBy");
const isBefore = require("date-fns/isBefore");
const pick = require("lodash/pick");

const { ObjectId } = mongoose.Types;


class Invoice {

    /**
     * Generate new number for new creating invoice
     * 
     * @return integer
     */
    static async generateNumber() {
        try {
            const Invoice = this.model('Invoice');
            let number = 0;
            let exist = true;
            while (exist) {
                number += 1;
                exist = await Invoice.findOne({ number });
            }
            return number;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Sync invoice items
     * 
     * @param {Invoice} invoice invoice
     * @param {array} items items to sync
     * @param {Object} args extra arguments
     */
    async syncItems(items, { connection }) {
        try {

            const InvoiceItem = this.model('InvoiceItem');

            if (!this.wasNew) {
                // remove items that are not in updated array
                const invoiceItems = await InvoiceItem.find({
                    invoice: this.id
                });
                const itemsIds = invoiceItems.map(i => i.id);
                const dataItemsIds = items.map(it => it.id).filter(Boolean)
                const diff = itemsIds.map(
                    item => dataItemsIds.includes(item) ? null : item
                ).filter(Boolean);

                await InvoiceItem.deleteMany({ _id: { $in: diff } });
            }

            // update the rest
            this.items = await Promise.all(
                items.map(
                    async item => await InvoiceItem.createOrUpdate(
                        { ...item, invoice: this },
                        item.id,
                        { connection }
                    )
                )
            )

            // save invoice
            await this.save();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Create new or update an exsiting invoice
     * 
     * @param {Object} data data
     * @param {string} invoiceId updating invoiceId
     * @param {Object} options extra options
     * @param {Connection} connection workspace connection
     * @param {func} inject workspace module inject
     * @returns Invoice
     */
    static async createOrUpdate(data, invoiceId, { connection, inject }) {
        try {
            const Invoice = this.model('Invoice');

            // create or get invoice instance
            const invoice = invoiceId ?
                await Invoice.findById(
                    ObjectId(invoiceId)
                ) : new Invoice();

            // assign number
            invoice.number = data.number || await this.generateNumber();

            // attach invoice number if is new
            if (invoice.isNew) {

                // // assign roles
                // const Meta = this.model('Meta');
                // const label = await Meta.findOne({ label: 'invoice-label', identifier: 'reserve' });
                // invoice.label = label.id;

                // assign client
                const Client = this.model('Person');
                const client = await Doc.resolve(data.client, Client);
                invoice.client = client.id;
            }

            // assign other fields
            Object.keys(
                pick(data, [
                    'note',
                    'validTill'
                ])
            ).forEach(key => {
                invoice[key] = data[key];
            });

            // assign factors
            if (data.factors) {
                invoice.factors = data.factors.map(
                    factor => pick(factor, [
                        'title',
                        'type',
                        'amount',
                        'unit'
                    ])
                )
            }

            // inject pre save hooks
            await inject('preSave', { invoice, data, connection })

            // save changes
            await invoice.save();

            // sync items
            await invoice.syncItems(data.items, { connection });

            // inject post save hooks
            await inject('postSave', { invoice, data, connection })

            // return modified invoice
            return invoice;
        } catch (error) {
            throw error;
        }
    }

    // /**
    //  * Get invoice details
    //  * 
    //  * @return integer
    //  */
    // static async getDetails(invoice, { connection, inject }) {
    //     try {
    //         const Invoice = this.model('Invoice');

    //         invoice = await Doc.resolve(invoice, Invoice);

    //         const injections = await inject('queryPopulation');

    //         invoice = await Invoice
    //             .findById(invoice.id)
    //             .populate([
    //                 { path: "label", select: "identifier name" },
    //                 { path: "client" },
    //                 { path: "items" },
    //                 { path: "items", populate: [{ path: "item" }] },
    //                 ...injections
    //             ])
    //             .lean({ virtuals: true });

    //         return invoice;
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    /**
     * Check if invoice is still valid
     * 
     * @return {bool}
     */
    get isValid() {
        if (!this.validTill) {
            return true;
        }
        return isBefore(this.validTill, new Date());
    }

    /**
     * Get invoice subtotal
     * 
     * @returns {Number}
     */
    get subtotal() {
        return sumBy(this.items, 'total');
    }

    /**
     * Get invoice total
     * 
     * @returns {Number}
     */
    get total() {
        let subtotal = this.subtotal;
        return subtotal + sumBy(this.factors, factor => {
            return (
                factor.unit === 'price' ?
                    factor.amount :
                    (factor.amount / 100 * subtotal)
            ) * (factor.type === 'reducer' ? -1 : 1);
        });
    }

    //
}

module.exports = Invoice;