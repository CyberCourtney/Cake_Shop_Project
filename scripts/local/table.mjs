// Creates the main table locally with the same keys and index as infrastructure/cloudformation/nested/data.yaml.
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from "@aws-sdk/client-dynamodb";

export async function createTable(endpoint, TableName) {
  const client = new DynamoDBClient({ endpoint, region: "eu-west-2", credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  try {
    await client.send(
      new CreateTableCommand({
        TableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: ["pk", "sk", "gsi1pk", "gsi1sk"].map((AttributeName) => ({ AttributeName, AttributeType: "S" })),
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "gsi1",
            KeySchema: [{ AttributeName: "gsi1pk", KeyType: "HASH" }, { AttributeName: "gsi1sk", KeyType: "RANGE" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }
}
