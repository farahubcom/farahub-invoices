const { Doc } = require('@farahub/framework/facades');
const pick = require("lodash/pick");
const mongoose = require("mongoose");

const { ObjectId } = mongoose.Types;


class InvoiceItem {

    /**
     * Create new or update an exsiting invoice item
     * 
     * @param {Object} data data
     * @param {string} itemId updating itemId
     * @param {Object} options extra options
     * @param {Connection} connection workspace connection
     * @returns InvoiceItem
     */
    static async createOrUpdate(data, itemId, { inject, connection }) {
        try {

            const InvoiceItem = this.model('InvoiceItem');

            // create or get invoice item instance
            const item = itemId ?
                await InvoiceItem.findById(
                    ObjectId(itemId)
                ) : new InvoiceItem();

            // assign item invoice & product
            if (item.isNew) {

                // assign item invoice
                const Invoice = this.model('Invoice');
                const invoice = await Doc.resolve(data.invoice, Invoice);
                item.invoice = invoice.id;

                // assign item product
                const Product = this.model('Product');
                const product = await Doc.resolve(data.item, Product);
                item.item = product.id;
                item.itemModel = 'Product';
            }

            // assign rest of fields
            Object.keys(
                pick(data, [
                    'quantity',
                    'unitPrice',
                    'discountPercent',
                    'note'
                ])
            ).forEach(key => {
                item[key] = data[key];
            });

            // inject pre save hooks
            await inject('preSave', { item, data, itemId, connection })

            // save changes
            await item.save();

            // inject post save hooks
            await inject('postSave', { item, data, itemId, connection })

            // return modified item
            return item;
        } catch (error) {
            throw error;
        }
    }

    get total() {
        const total = this.unitPrice * this.reservedQuantity * (this.duration || 1);
        const discountPrice = this.discountPercent / 100 * total;
        return total - discountPrice;
    }
}

module.exports = InvoiceItem;