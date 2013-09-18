Log http request to postgres.
- Automatically does table partitioning by month
- Can store user selected values by extending definition and adding map like so {key: keyNameOnReqObject}
  - e.g. {uuid: 'uuid'} -- this will get req.uuid
  - Can access nested properties on req object by using an array for the e.g. {uuid: ['session', 'uuid']} -- this will get req.session.uuid
