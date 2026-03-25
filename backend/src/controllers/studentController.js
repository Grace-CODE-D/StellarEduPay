const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');

// POST /api/students
async function registerStudent(req, res, next) {
  try {
    const { studentId, name, class: className, feeAmount } = req.body;

    // Exact duplicate check by studentId
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) {
      const err = new Error(`A student with ID "${studentId}" already exists`);
      err.code = 'DUPLICATE_STUDENT';
      return next(err);
    }

    // Fuzzy duplicate check (same name + class, case-insensitive)
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const similarStudent = await Student.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      class: className,
    });

    let assignedFee = feeAmount;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ className, isActive: true });
      if (feeStructure) assignedFee = feeStructure.feeAmount;
    }

    if (assignedFee == null) {
      const err = new Error(`No fee amount provided and no fee structure found for class "${className}". Please create a fee structure first or provide feeAmount.`);
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const student = await Student.create({ studentId, name, class: className, feeAmount: assignedFee });

    const response = student.toObject ? student.toObject() : { ...student };
    if (similarStudent) {
      response.warning = `A student named "${similarStudent.name}" already exists in class ${className} with ID "${similarStudent.studentId}". This may be a duplicate.`;
    }
    res.status(201).json(response);
  } catch (err) {
    if (err.code === 11000) {
      const dupErr = new Error('A student with this ID already exists');
      dupErr.code = 'DUPLICATE_STUDENT';
      return next(dupErr);
    }
    next(err);
  }
}

// GET /api/students
async function getAllStudents(req, res, next) {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    next(err);
  }
}

// GET /api/students/:studentId
async function getStudent(req, res, next) {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    res.json(student);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerStudent, getAllStudents, getStudent };
