const { Controller } = require('@farahub/framework/foundation');
const { Lang, Auth, Workspace, Injection, Doc, Num } = require('@farahub/framework/facades');
const mongoose = require('mongoose');
const isValid = require('date-fns/isValid');
const fromUnixTime = require('date-fns/fromUnixTime');
const startOfDay = require("date-fns/startOfDay");
const endOfDay = require("date-fns/endOfDay");


const { ObjectId } = mongoose.Types;

class MainController extends Controller {

    /**
     * The controller name
     * 
     * @var string
     */
    name = 'Main';

    /**
     * The controller routes
     * 
     * @var array
     */
    routes = [
        {
            type: 'api',
            method: 'get',
            path: '/invoices/:label',
            handler: 'list',
        },
        {
            type: 'api',
            method: 'post',
            path: '/invoices/:label',
            handler: 'createOrUpdate',
        },
        {
            type: 'api',
            method: 'get',
            path: '/invoices/new/number',
            handler: 'newNumber',
        },
        {
            type: 'api',
            method: 'get',
            path: '/invoice/:invoiceId',
            handler: 'details',
        },
        {
            type: 'api',
            method: 'delete',
            path: '/invoice/:invoiceId',
            handler: 'delete',
        }
        //
    ]

    /**
     * List of invoices match params
     * 
     * @return void
     */
    list() {
        return [
            Auth.authenticate('jwt', { session: false }),
            Workspace.resolve(this.app),
            Injection.register(this.module, 'main.list'),
            async function (req, res, next) {
                try {

                    const { wsConnection: connection } = req;

                    const Invoice = connection.model('Invoice');
                    const Client = connection.model('Person');

                    const args = req.query;

                    let search = {};

                    if (req.params && req.params.label) {
                        const Meta = connection.model('Meta');
                        const label = await Doc.resolveByIdentifier(req.params.label, Meta);
                        search = { ...search, label: label.id };
                    }

                    if (args && args.number && args.number !== '') {
                        search = { ...search, number: args.number }
                    }

                    if (args && Boolean(args.reservedFrom) && isValid(fromUnixTime(args.reservedFrom))) {
                        search = {
                            ...search,
                            reservedAt: {
                                $gte: startOfDay(fromUnixTime(args.reservedFrom))
                            }
                        }
                    }

                    if (args && Boolean(args.reservedTo) && isValid(fromUnixTime(args.reservedTo))) {
                        search = {
                            ...search,
                            reservedAt: {
                                ...search.reservedAt,
                                $lt: endOfDay(fromUnixTime(args.reservedTo))
                            }
                        }
                    }

                    if (args && args.client) {
                        const clients = await Client.find(
                            Num.isNumeric(args.client) ?
                                { code: Number(args.client) } :
                                {
                                    $or: [
                                        { firstName: { $regex: args.client + '.*' } },
                                        { lastName: { $regex: args.client + '.*' } }
                                    ]
                                }
                        );
                        const clientsIds = clients.map(client => client._id);
                        search = { ...search, client: { $in: clientsIds } };
                    }

                    const sort = args && args.sort ? args.sort : "-createdAt"

                    const queryInjections = await this.module.inject('main.list.queryPopulation');

                    const query = Invoice.find(search)
                        .populate([
                            { path: "client" },
                            { path: "items" },
                            { path: "items", populate: [{ path: "item" }] },
                            ...queryInjections
                        ])

                    query.sort(sort);

                    const total = await Invoice.find(search).count();


                    if (args && args.page > -1) {
                        const perPage = args.perPage || 10;
                        query.skip(args.page * perPage)
                            .limit(perPage)
                    }

                    let data = await query.lean({ virtuals: true });

                    data = Lang.translate(data)

                    return res.json({ ok: true, data, total });
                } catch (error) {
                    next(error);
                }
            }
        ]
    }

    /**
     * Get new number for new creating invoice
     * 
     * @return void
     */
    newNumber() {
        return [
            Auth.authenticate('jwt', { session: false }),
            Workspace.resolve(this.app),
            Injection.register(this.module, 'main.newNumber'),
            async function (req, res, next) {
                try {
                    const Invoice = req.wsConnection.model('Invoice');
                    const number = await Invoice.generateNumber();
                    return res.json({ ok: true, number })
                } catch (error) {
                    next(error);
                }
            }
        ]
    }

    /**
     * Get details of invoice
     * 
     * @return void
     */
    details() {
        return [
            Auth.authenticate('jwt', { session: false }),
            Workspace.resolve(this.app),
            Injection.register(this.module, 'main.details'),
            async function (req, res, next) {
                try {

                    const { invoiceId } = req.params;


                    const Invoice = req.wsConnection.model('Invoice');

                    let invoice = await Invoice.getDetails(
                        invoiceId,
                        { connection: req.wsConnection, inject: req.inject }
                    )

                    // const injections = await this.module.inject('main.details.queryPopulation');

                    // const response = await Invoice
                    //     .findById(ObjectId(invoiceId))
                    //     .populate([
                    //         { path: "label", select: "identifier name" },
                    //         { path: "client" },
                    //         { path: "items" },
                    //         { path: "items", populate: [{ path: "item" }] },
                    //         ...(injections && injections)
                    //     ])
                    //     .lean({ virtuals: true });


                    invoice = Lang.translate(invoice);

                    return res.json({ ok: true, invoice });
                } catch (error) {
                    next(error);
                }
            }
        ]
    }

    /**
     * Create or upadte an existing invoice
     * 
     * @param {*} req request
     * @param {*} res response
     * 
     * @return void
     */
    createOrUpdate() {
        return [
            Auth.authenticate('jwt', { session: false }),
            Workspace.resolve(this.app),
            Injection.register(this.module, 'main.createOrUpdate'),
            async function (req, res, next) {
                try {

                    const { inject, wsConnection: connection } = req;

                    const data = req.body;
                    const { label } = req.params;

                    const Invoice = connection.model('Invoice');

                    let invoice = await Invoice.createOrUpdate(
                        { ...data, label },
                        data.id,
                        { connection, inject }
                    );

                    // log the activity
                    const Activity = connection.model('Activity');

                    await Activity.createNew({
                        causer: ObjectId(req.user.id),
                        causerModel: 'User',
                        subject: invoice.id,
                        subjectModel: 'Invoice',
                        event: invoice.wasNew ? 'created' : 'updated',
                    });


                    invoice = await Invoice.getDetails(
                        invoice.id,
                        { connection, inject }
                    )

                    invoice = Lang.translate(invoice);

                    return res.json({ ok: true, invoice })
                } catch (error) {
                    next(error);
                }
            }
        ]
    }

    /**
     * Delete an existing invoice from db
     * 
     * @param {*} req request
     * @param {*} res response
     * 
     * @return void
     */
    delete() {
        return [
            Auth.authenticate('jwt', { session: false }),
            Workspace.resolve(this.app),
            Injection.register(this.module, 'main.delete'),
            async function (req, res, next) {
                try {
                    const { invoiceId } = req.params;

                    const { inject, wsConnection: connection } = req;

                    await inject('main.delete.preDelete', { invoiceId, connection })

                    // remove all items
                    await connection.model('InvoiceItem').deleteMany({
                        invoice: ObjectId(invoiceId),
                    });

                    // delete invoice
                    await connection.model('Invoice').findByIdAndDelete(
                        ObjectId(invoiceId)
                    )

                    // return response
                    return res.json({ ok: true })
                } catch (error) {
                    next(error);
                }
            }
        ]
    }

    //
}

module.exports = MainController;