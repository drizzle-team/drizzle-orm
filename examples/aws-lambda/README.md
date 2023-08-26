## Drizzle ORM AWS Lambda Example

## Initial project setup
- Create a `.env` file and add the database connection url
- Run `npm install`
- Configure AWS account credentials

### Migrations
- Set the correct DB connection url in `migrate.ts`
- To create a migration file run `npm run generate-migration`
- To apply the migration run `npm run migrate`

### Deployment
- Run `serverless deploy`

### Usage with AWS Aurora DB
- To be able to connect to an Aurora RDS Instance, the Lambda function has to be in the same VPC as the RDS Instance.
- As an example, this can be achieved the following way using serverless framework:
```
custom:
  vpc_config: &vpc_config
    vpc:
      securityGroupIds:
        - sg-samplegroupId
      subnetIds:
        - subnet-sample1
        - subnet-sample2
        - subnet-sample3

functions:
  getUsers:
    handler: ./src/api/user.getAll
    <<: *vpc_config
```

#### To expose the Lambda function with the API Gateway add the following code snippet in `serverless.yml`
```
functions:
  getUsers:
    handler: ./src/api/user.getAll
    events:
      - http:
          path: "users"
          method: GET

resources:
  Resources:
    GatewayResponse:
      Type: "AWS::ApiGateway::GatewayResponse"
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
          gatewayresponse.header.Access-Control-Allow-Methods: "'*'"
        ResponseType: DEFAULT_4XX
        RestApiId:
          Ref: "ApiGatewayRestApi"
    GatewayResponse5xx:
      Type: "AWS::ApiGateway::GatewayResponse"
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
          gatewayresponse.header.Access-Control-Allow-Methods: "'*'"
        ResponseType: DEFAULT_5XX
        RestApiId:
          Ref: "ApiGatewayRestApi"
```
