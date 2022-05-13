## All int suite list ## 

# Insert
1.Insert all fields to table
2.Insert all required fields to table
3.InsertMany with same model for all inserted values
4.InsertMany with different models for all inserted values
5.Insert with onConflict statement
// (DRI-17 ) 6.Inserting an null value into a serial field 

# Update
1.Update all fields from table
2.Update 1 by 1 field from table
3.Update batches of several fields from table

# Delete
1.Delete by field values

## Exception cases
# Insert
1.Insert double primary int
2.Insert double unique int
3.(DRI-15) Insert float 
4.OnConflict insert used a non-existent index

# Update
1.Update double primary int
2.Update double unique int
3.(DRI-15)Update to float