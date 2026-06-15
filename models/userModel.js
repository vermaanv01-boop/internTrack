const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name:{"type":String , required:[true, "Please provide name"]},
    email:{"type":String , required:[true, "Please provide email"]},
    password:{"type":String , required :[true,"Please provide password"],unique:true},
    timestamp:{"type":Date , default:Date.now}  


})
module.exports = mongoose.model("User", userSchema);